#include "remoteControlServer.h"

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <mutex>
#include <optional>
#include <regex>
#include <set>
#include <stdexcept>
#include <string>
#include <string_view>
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
	std::vector<std::regex> AuthenticatedPaths;
	jsonrpc::JsonRpcServer Rpc;
	DigestAuthenticator Auth;
	NetworkWatcher &Network;
	MessageLocalizer LocalizeMessage;

	std::mutex ListenersMutex;
	std::vector<Listener> Listeners;
	std::function<void(const std::string &, unsigned short)> BindFailure;
	std::set<std::string> ReportedBindFailures;
	unsigned short Port = DefaultPort;
	bool Running = false;

	const std::filesystem::path WwwRoot = ModuleDirectory() / "wwwroot";

	Impl(std::vector<std::unique_ptr<IRemoteControlCommand>> commands, NetworkWatcher &network, MessageLocalizer localize)
		: Commands(std::move(commands)), Network(network), LocalizeMessage(std::move(localize))
	{
		Routes.push_back([this](httplib::Server &http)
						 {
			http.set_payload_max_length(static_cast<std::size_t>(2) * 1024 * 1024 * 1024);

			http.set_pre_routing_handler([this](const httplib::Request &req, httplib::Response &res)
										 {
											 if (RequiresAuthentication(req) && !Auth.Authorize(req, res))
												 return httplib::Server::HandlerResponse::Handled;
											 if (!IsUploadRequest(req) && PayloadTooLarge(req))
											 {
												 res.status = 413;
												 return httplib::Server::HandlerResponse::Handled;
											 }
											 return httplib::Server::HandlerResponse::Unhandled; });

			http.Post("/RPC_JSON", [this](const httplib::Request &req, httplib::Response &res)
					  {
				auto request = nlohmann::json::parse(req.body, nullptr, false);
				if (request.is_object())
					NormalizeParams(request);
				res.set_content(Rpc.HandleRequest(request.is_discarded() ? req.body : request.dump()),
					"application/json"); }); });

		for (auto &cmd : Commands)
			cmd->Register(*this);

		AddStaticFileFallback();

		Network.Subscribe([this](const std::vector<NetworkAddress> &allowed)
						  { return Reconcile(allowed); });
	}

	void Add(const std::string &name, RpcMethod method) override
	{
		std::function<nlohmann::json(nlohmann::json)> handler =
			[this, method = std::move(method)](nlohmann::json params)
		{
			try
			{
				return method(params);
			}
			catch (const LocalizedRpcError &e)
			{
				throw jsonrpc::exception(e.Code(), LocalizeMessage(std::string("AIMPRemoteControlErrors\\") + e.Key()));
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
		AuthenticatedPaths.emplace_back(pathPattern);
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

	using HttpRoute = httplib::Server &(httplib::Server::*)(const std::string &, httplib::Server::Handler);

	static HttpRoute RouteFor(HttpMethod method)
	{
		switch (method)
		{
		case HttpMethod::Get:
			return &httplib::Server::Get;
		case HttpMethod::Post:
			return static_cast<HttpRoute>(&httplib::Server::Post);
		case HttpMethod::Put:
			return static_cast<HttpRoute>(&httplib::Server::Put);
		case HttpMethod::Patch:
			return static_cast<HttpRoute>(&httplib::Server::Patch);
		case HttpMethod::Delete:
			return static_cast<HttpRoute>(&httplib::Server::Delete);
		}
		throw std::invalid_argument("unsupported API method");
	}

	void AddApi(HttpMethod method, const std::string &pathPattern, ApiHandler handler) override
	{
		const HttpRoute route = RouteFor(method);
		AuthenticatedPaths.emplace_back(pathPattern);
		Routes.push_back([this, route, pathPattern, handler = std::move(handler)](httplib::Server &http)
						 { (http.*route)(pathPattern, [this, handler](const httplib::Request &req, httplib::Response &res)
										   {
				ApiRequest request;
				for (std::size_t i = 1; i < req.matches.size(); ++i)
					request.PathMatches.push_back(req.matches[i].str());
				request.Query.insert(req.params.begin(), req.params.end());
				try
				{
					if (!req.body.empty())
					{
						request.Body = nlohmann::json::parse(req.body, nullptr, false);
						if (request.Body.is_discarded())
							throw ApiError(400, "invalidJson");
					}
					res.set_content(handler(request).dump(), "application/json");
				}
				catch (const ApiError &e)
				{
					res.status = e.Status();
					res.set_content(nlohmann::json{{"error", {{"code", e.Code()}, {"message", LocalizeMessage(std::string("AIMPRemoteControlErrors\\") + e.Code())}}}}.dump(), "application/json");
				} }); });
	}

	class EventStream : public IEventStream
	{
	public:
		explicit EventStream(httplib::DataSink &sink) : FSink(sink) {}

		bool Send(const std::string &event, const std::string &data) override
		{
			std::string message = "event: " + event + "\n";
			std::size_t start = 0;
			while (true)
			{
				const std::size_t end = data.find('\n', start);
				message += "data: " + data.substr(start, end == std::string::npos ? std::string::npos : end - start) + "\n";
				if (end == std::string::npos)
					break;
				start = end + 1;
			}
			return Write(message + "\n");
		}

		bool Ping() override { return Write(": ping\n\n"); }

		bool Write(const std::string &text)
		{
			return FSink.is_writable() && FSink.write(text.data(), text.size());
		}

	private:
		httplib::DataSink &FSink;
	};

	void AddEventStream(const std::string &pathPattern, EventStreamHandler handler) override
	{
		AuthenticatedPaths.emplace_back(pathPattern);
		Routes.push_back([pathPattern, handler = std::move(handler)](httplib::Server &http)
						 { http.Get(pathPattern, [handler](const httplib::Request &, httplib::Response &res)
									{
				// no-transform keeps compressing proxies from buffering the stream; the Next dev
				// server gzips proxied responses and would hold events back until its buffer fills.
				res.set_header("Cache-Control", "no-cache, no-transform");
				res.set_header("X-Accel-Buffering", "no");
				res.set_chunked_content_provider("text/event-stream", [handler](std::size_t, httplib::DataSink &sink)
												 {
					EventStream stream(sink);
					if (stream.Write("retry: 3000\n\n"))
						handler(stream);
					sink.done();
					return true; }); }); });
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

	void AddStaticFileFallback()
	{
		Routes.push_back([this](httplib::Server &http)
						 { http.Get(".*", [this](const httplib::Request &req, httplib::Response &res)
									{ ServeStaticFile(req, res); }); });
	}

	bool RequiresAuthentication(const httplib::Request &req) const
	{
		if (req.method != "GET" && req.method != "HEAD")
			return true;
		return std::any_of(AuthenticatedPaths.begin(), AuthenticatedPaths.end(), [&](const std::regex &pattern)
						   { return std::regex_match(req.path, pattern); });
	}

	static bool IsInside(const std::filesystem::path &root, const std::filesystem::path &path)
	{
		return std::mismatch(root.begin(), root.end(), path.begin(), path.end()).first == root.end();
	}

	std::optional<std::filesystem::path> ResolveStaticFile(const std::string &path) const
	{
		if (path.empty() || path.front() != '/')
			return std::nullopt;

		std::error_code ec;
		const std::filesystem::path root = std::filesystem::weakly_canonical(WwwRoot, ec);
		if (ec || root.empty())
			return std::nullopt;

		const std::u8string relative(path.begin() + 1, path.end());
		const std::filesystem::path target =
			std::filesystem::weakly_canonical(root / std::filesystem::path(relative), ec);
		if (ec || !IsInside(root, target))
			return std::nullopt;

		if (std::filesystem::is_regular_file(target, ec))
			return target;

		const std::filesystem::path directoryIndex = target / "index.html";
		if (std::filesystem::is_regular_file(directoryIndex, ec))
			return directoryIndex;

		return std::nullopt;
	}

	void ServeStaticFile(const httplib::Request &req, httplib::Response &res) const
	{
		res.set_header("Cache-Control", "no-cache");

		if (const auto file = ResolveStaticFile(req.path))
		{
			res.set_file_content(file->string());
			return;
		}

		res.status = 404;
		const std::filesystem::path notFound = WwwRoot / "404.html";
		std::error_code ec;
		if (std::filesystem::is_regular_file(notFound, ec))
			res.set_file_content(notFound.string());
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

AIMPRemoteControlServer::AIMPRemoteControlServer(std::vector<std::unique_ptr<IRemoteControlCommand>> commands, NetworkWatcher &network, MessageLocalizer localize)
	: FImpl(std::make_unique<Impl>(std::move(commands), network, std::move(localize))) {}

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
