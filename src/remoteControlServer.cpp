#include "remoteControlServer.h"

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <mutex>
#include <regex>
#include <set>
#include <string>
#include <thread>

#include <httplib.h>
#include <cxx/jsonrpc/server.hpp>
#include <nlohmann/json.hpp>

#include "digestAuthenticator.h"
#include "joinPumpingMessages.h"
#include "moduleDirectory.h"
#include "networkWatcher.h"
#include "remoteControlCommand.h"

struct AIMPRemoteControlServer::Impl : IRpcRegistrar
{
	struct Listener
	{
		std::string Address;
		std::unique_ptr<httplib::Server> Http;
		std::thread Thread;
	};

	static constexpr std::size_t MaxJsonPayload = static_cast<std::size_t>(16) * 1024 * 1024;

	std::vector<std::unique_ptr<IRemoteControlCommand>> Commands;
	std::vector<std::function<void(httplib::Server &)>> Routes;
	std::vector<std::regex> UploadPaths;
	jsonrpc::JsonRpcServer Rpc;
	DigestAuthenticator Auth;
	NetworkWatcher &Network;

	std::mutex ListenersMutex;
	std::vector<Listener> Listeners;
	std::function<void(const std::string &, unsigned short)> BindFailure;
	std::set<std::string> ReportedBindFailures;
	unsigned short Port = DefaultPort;
	bool Running = false;

	const std::filesystem::path WwwRoot = ModuleDirectory() / "wwwroot";

	Impl(std::vector<std::unique_ptr<IRemoteControlCommand>> commands, NetworkWatcher &network)
		: Commands(std::move(commands)), Network(network)
	{
		Routes.push_back([this](httplib::Server &http)
						 {
			http.new_task_queue = []
			{ return new httplib::ThreadPool(32); };
			http.set_payload_max_length(static_cast<std::size_t>(2) * 1024 * 1024 * 1024);

			std::error_code ec;
			if (std::filesystem::is_directory(WwwRoot, ec))
				http.set_mount_point("/", WwwRoot.string(), {{"Cache-Control", "no-cache"}});

			http.set_pre_routing_handler([this](const httplib::Request &req, httplib::Response &res)
										 {
											 if (IsStaticFileRequest(req))
												 return httplib::Server::HandlerResponse::Unhandled;
											 if (!IsUploadRequest(req) && PayloadTooLarge(req))
											 {
												 res.status = 413;
												 return httplib::Server::HandlerResponse::Handled;
											 }
											 return Auth.Authorize(req, res)
														? httplib::Server::HandlerResponse::Unhandled
														: httplib::Server::HandlerResponse::Handled; });

			http.Post("/RPC_JSON", [this](const httplib::Request &req, httplib::Response &res)
					  {
				auto request = nlohmann::json::parse(req.body, nullptr, false);
				if (request.is_object())
					NormalizeParams(request);
				res.set_content(Rpc.HandleRequest(request.is_discarded() ? req.body : request.dump()),
					"application/json"); }); });

		for (auto &cmd : Commands)
			cmd->Register(*this);

		Network.Subscribe([this](const std::vector<NetworkAddress> &allowed)
						  { return Reconcile(allowed); });
	}

	void Add(const std::string &name, RpcMethod method) override
	{
		std::function<nlohmann::json(nlohmann::json)> handler =
			[method = std::move(method)](nlohmann::json params)
		{
			try
			{
				return method(params);
			}
			catch (const RpcError &e)
			{
				throw jsonrpc::exception(e.Code(), e.what());
			}
		};
		Rpc.Add(name, jsonrpc::GetHandle(handler));
	}

	void AddGet(const std::string &pathPattern, HttpGetHandler handler) override
	{
		Routes.push_back([pathPattern, handler = std::move(handler)](httplib::Server &http)
						 { http.Get(pathPattern, [handler](const httplib::Request &req, httplib::Response &res)
									{
				std::vector<std::string> matches;
				for (std::size_t i = 1; i < req.matches.size(); ++i)
					matches.push_back(req.matches[i].str());
				const auto content = handler(matches);
				if (!content)
				{
					res.status = 404;
					return;
				}
				for (const auto &[name, value] : content->Headers)
					res.set_header(name, value);
				if (!content->FilePath.empty())
					res.set_file_content(content->FilePath, content->ContentType);
				else
					res.set_content(content->Body, content->ContentType); }); });
	}

	void AddUpload(const std::string &pathPattern, HttpUploadHandler handler) override
	{
		UploadPaths.emplace_back(pathPattern);
		Routes.push_back([pathPattern, handler = std::move(handler)](httplib::Server &http)
						 { http.Post(pathPattern, [handler](const httplib::Request &req, httplib::Response &res)
									 {
				std::vector<std::string> matches;
				for (std::size_t i = 1; i < req.matches.size(); ++i)
					matches.push_back(req.matches[i].str());
				std::vector<HttpUploadedFile> files;
				for (const auto &[name, part] : req.form.files)
					files.push_back({name, part.filename, part.content_type, part.content});
				res.status = handler(matches, files); }); });
	}

	bool IsUploadRequest(const httplib::Request &req) const
	{
		return req.method == "POST" &&
			   std::any_of(UploadPaths.begin(), UploadPaths.end(), [&](const std::regex &pattern)
						   { return std::regex_match(req.path, pattern); });
	}

	bool PayloadTooLarge(const httplib::Request &req) const
	{
		if (httplib::detail::is_chunked_transfer_encoding(req.headers))
			return true;
		if (req.has_header("Content-Length"))
			return std::strtoull(req.get_header_value("Content-Length").c_str(), nullptr, 10) > MaxJsonPayload;
		return false;
	}

	bool IsStaticFileRequest(const httplib::Request &req) const
	{
		if (req.method != "GET" && req.method != "HEAD")
			return false;
		std::string relative = req.path == "/" ? "/index.html" : req.path;
		relative.erase(0, 1);

		std::error_code ec;
		const std::filesystem::path root = std::filesystem::weakly_canonical(WwwRoot, ec);
		if (ec || root.empty())
			return false;
		const std::filesystem::path target =
			std::filesystem::weakly_canonical(root / std::filesystem::path(std::u8string(relative.begin(), relative.end())), ec);
		if (ec || !std::filesystem::is_regular_file(target, ec))
			return false;
		const std::wstring rootStr = (root / L"").wstring();
		return target.wstring().compare(0, rootStr.size(), rootStr) == 0;
	}

	static void NormalizeParams(nlohmann::json &request)
	{
		nlohmann::json params = request.value("params", nlohmann::json::object());
		if (params.is_null())
			params = nlohmann::json::object();
		if (params.is_object())
			request["params"] = nlohmann::json::array({std::move(params)});
	}

	bool Reconcile(const std::vector<NetworkAddress> &allowed)
	{
		std::lock_guard lock(ListenersMutex);
		if (!Running)
			return true;

		const auto wanted = [&](const std::string &address)
		{
			return std::any_of(allowed.begin(), allowed.end(), [&](const NetworkAddress &a)
							   { return a.Address == address; });
		};
		for (auto it = Listeners.begin(); it != Listeners.end();)
		{
			if (wanted(it->Address))
				++it;
			else
			{
				Close(*it);
				it = Listeners.erase(it);
			}
		}

		std::erase_if(ReportedBindFailures, [&](const std::string &address)
					  { return !wanted(address); });

		bool complete = true;
		for (const NetworkAddress &a : allowed)
		{
			const bool bound = std::any_of(Listeners.begin(), Listeners.end(), [&](const Listener &l)
										   { return l.Address == a.Address; });
			if (bound || Open(a.Address))
			{
				ReportedBindFailures.erase(a.Address);
				continue;
			}
			complete = false;
			if (BindFailure && ReportedBindFailures.insert(a.Address).second)
				BindFailure(a.Address, Port);
		}
		return complete;
	}

	bool Open(const std::string &address)
	{
		Listener listener;
		listener.Address = address;
		listener.Http = std::make_unique<httplib::Server>();
		for (const auto &route : Routes)
			route(*listener.Http);
		if (!listener.Http->bind_to_port(address, Port))
			return false;
		httplib::Server *http = listener.Http.get();
		listener.Thread = std::thread([http]
									  { http->listen_after_bind(); });
		Listeners.push_back(std::move(listener));
		return true;
	}

	static void Close(Listener &listener)
	{
		listener.Http->stop();
		if (listener.Thread.joinable())
			JoinPumpingMessages(listener.Thread);
	}

	void CloseAll()
	{
		std::lock_guard lock(ListenersMutex);
		Running = false;
		for (Listener &listener : Listeners)
			Close(listener);
		Listeners.clear();
	}
};

AIMPRemoteControlServer::AIMPRemoteControlServer(std::vector<std::unique_ptr<IRemoteControlCommand>> commands, NetworkWatcher &network)
	: FImpl(std::make_unique<Impl>(std::move(commands), network)) {}

AIMPRemoteControlServer::~AIMPRemoteControlServer() { Stop(); }

bool AIMPRemoteControlServer::Start(unsigned short port)
{
	{
		std::lock_guard lock(FImpl->ListenersMutex);
		FImpl->Port = port;
		FImpl->Running = true;
	}
	return true;
}

void AIMPRemoteControlServer::OnBindFailure(std::function<void(const std::string &address, unsigned short port)> handler)
{
	std::lock_guard lock(FImpl->ListenersMutex);
	FImpl->BindFailure = std::move(handler);
}

void AIMPRemoteControlServer::Stop()
{
	if (FImpl)
		FImpl->CloseAll();
}

void AIMPRemoteControlServer::ApplySettings(const Settings &settings)
{
	FImpl->Auth.SetSettings(settings.Auth);
}
