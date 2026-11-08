#include "serviceDiscoveryServer.h"

#include <algorithm>
#include <array>
#include <future>
#include <map>
#include <memory>
#include <string>
#include <thread>

#include <asio.hpp>

#include "networkWatcher.h"

struct AIMPServiceDiscoveryServer::Impl
{
	struct Listener
	{
		asio::ip::udp::socket Socket;
		asio::ip::udp::endpoint Sender;
		std::array<char, 1024> Buffer{};

		explicit Listener(asio::io_context &io) : Socket(io) {}
	};

	asio::io_context Io;
	asio::executor_work_guard<asio::io_context::executor_type> Work{asio::make_work_guard(Io)};
	std::map<std::string, std::shared_ptr<Listener>> Listeners;
	std::string Reply;
	std::thread Thread;

	void Receive(const std::shared_ptr<Listener> &listener)
	{
		listener->Socket.async_receive_from(asio::buffer(listener->Buffer), listener->Sender,
											[this, listener](std::error_code ec, std::size_t)
											{
												if (ec == asio::error::operation_aborted || !listener->Socket.is_open())
													return;
												if (!ec)
													listener->Socket.send_to(asio::buffer(Reply), listener->Sender, 0, ec);
												Receive(listener);
											});
	}

	bool Open(const NetworkAddress &address)
	{
		auto listener = std::make_shared<Listener>(Io);
		std::error_code ec;
		listener->Socket.open(asio::ip::udp::v4(), ec);
		if (ec)
			return false;
		listener->Socket.set_option(asio::socket_base::reuse_address(true), ec);
		listener->Socket.set_option(asio::socket_base::broadcast(true), ec);
#ifdef _WIN32
		listener->Socket.bind(asio::ip::udp::endpoint(asio::ip::make_address_v4(address.Address), DiscoveryPort), ec);
#else
		// Linux delivers broadcasts only to sockets bound to INADDR_ANY.
		// Restrict the socket to the interface instead of binding it to the address.
		setsockopt(listener->Socket.native_handle(), SOL_SOCKET, SO_BINDTODEVICE,
				   address.InterfaceId.c_str(), static_cast<socklen_t>(address.InterfaceId.size()));
		listener->Socket.bind(asio::ip::udp::endpoint(asio::ip::udp::v4(), DiscoveryPort), ec);
#endif
		if (ec)
			return false;
		Listeners[address.Address] = listener;
		Receive(listener);
		return true;
	}

	bool Reconcile(const std::vector<NetworkAddress> &allowed)
	{
		for (auto it = Listeners.begin(); it != Listeners.end();)
		{
			const bool wanted = std::any_of(allowed.begin(), allowed.end(), [&](const NetworkAddress &a)
											{ return a.Address == it->first; });
			if (wanted)
				++it;
			else
			{
				std::error_code ec;
				it->second->Socket.close(ec);
				it = Listeners.erase(it);
			}
		}
		bool complete = true;
		for (const NetworkAddress &a : allowed)
			if (!Listeners.count(a.Address) && !Open(a))
				complete = false;
		return complete;
	}

	void CloseAll()
	{
		for (auto &[address, listener] : Listeners)
		{
			std::error_code ec;
			listener->Socket.close(ec);
		}
		Listeners.clear();
	}
};

AIMPServiceDiscoveryServer::AIMPServiceDiscoveryServer() = default;
AIMPServiceDiscoveryServer::~AIMPServiceDiscoveryServer() { Stop(); }

bool AIMPServiceDiscoveryServer::Start(NetworkWatcher &network)
{
	if (FImpl)
		return true;

	auto impl = std::make_unique<Impl>();
	impl->Reply = asio::ip::host_name();
	Impl *p = impl.get();
	network.Subscribe([p](const std::vector<NetworkAddress> &allowed)
					  {
						  std::promise<bool> done;
						  asio::post(p->Io, [p, &allowed, &done]
									 { done.set_value(p->Reconcile(allowed)); });
						  return done.get_future().get(); });
	impl->Thread = std::thread([p]()
							   { p->Io.run(); });

	FImpl = std::move(impl);
	return true;
}

void AIMPServiceDiscoveryServer::Stop()
{
	if (!FImpl)
		return;

	asio::post(FImpl->Io, [p = FImpl.get()]()
			   {
		p->CloseAll();
		p->Work.reset(); });
	if (FImpl->Thread.joinable())
		FImpl->Thread.join();

	FImpl.reset();
}
