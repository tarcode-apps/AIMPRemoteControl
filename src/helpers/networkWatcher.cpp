#include "networkWatcher.h"

#include <algorithm>
#include <chrono>

#include "joinPumpingMessages.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <netioapi.h>
#else
#include <cstdint>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <sys/eventfd.h>
#include <sys/socket.h>
#include <poll.h>
#include <unistd.h>
#endif

namespace
{
	constexpr std::chrono::seconds RetryInterval{2};
}

#ifdef _WIN32
struct NetworkWatcher::OsNotifications
{
	NetworkWatcher &Owner;
	HANDLE AddressHandle = nullptr;
	HANDLE InterfaceHandle = nullptr;

	explicit OsNotifications(NetworkWatcher &owner) : Owner(owner)
	{
		NotifyUnicastIpAddressChange(AF_INET, &OnAddressChange, this, FALSE, &AddressHandle);
		NotifyIpInterfaceChange(AF_INET, &OnInterfaceChange, this, FALSE, &InterfaceHandle);
	}

	~OsNotifications()
	{
		// Blocks until running callbacks return, so Owner stays valid inside them.
		if (AddressHandle)
			CancelMibChangeNotify2(AddressHandle);
		if (InterfaceHandle)
			CancelMibChangeNotify2(InterfaceHandle);
	}

	static void WINAPI OnAddressChange(PVOID context, PMIB_UNICASTIPADDRESS_ROW, MIB_NOTIFICATION_TYPE)
	{
		static_cast<OsNotifications *>(context)->Owner.Refresh();
	}

	static void WINAPI OnInterfaceChange(PVOID context, PMIB_IPINTERFACE_ROW, MIB_NOTIFICATION_TYPE)
	{
		static_cast<OsNotifications *>(context)->Owner.Refresh();
	}
};
#else
struct NetworkWatcher::OsNotifications
{
	NetworkWatcher &Owner;
	int Netlink = -1;
	int StopEvent = -1;
	std::thread Thread;

	explicit OsNotifications(NetworkWatcher &owner) : Owner(owner)
	{
		Netlink = socket(AF_NETLINK, SOCK_RAW | SOCK_CLOEXEC, NETLINK_ROUTE);
		StopEvent = eventfd(0, EFD_CLOEXEC);
		if (Netlink < 0 || StopEvent < 0)
			return;
		sockaddr_nl address{};
		address.nl_family = AF_NETLINK;
		address.nl_groups = RTMGRP_LINK | RTMGRP_IPV4_IFADDR;
		if (bind(Netlink, reinterpret_cast<sockaddr *>(&address), sizeof(address)) != 0)
			return;
		Thread = std::thread([this]
							 { Listen(); });
	}

	~OsNotifications()
	{
		if (StopEvent >= 0)
		{
			const std::uint64_t one = 1;
			[[maybe_unused]] const ssize_t written = write(StopEvent, &one, sizeof(one));
		}
		if (Thread.joinable())
			Thread.join();
		if (Netlink >= 0)
			close(Netlink);
		if (StopEvent >= 0)
			close(StopEvent);
	}

	void Listen()
	{
		char buffer[8192];
		pollfd fds[2] = {{Netlink, POLLIN, 0}, {StopEvent, POLLIN, 0}};
		for (;;)
		{
			if (poll(fds, 2, -1) < 0)
				continue;
			if (fds[1].revents)
				return;
			if ((fds[0].revents & POLLIN) && recv(Netlink, buffer, sizeof(buffer), 0) > 0)
				Owner.Refresh();
		}
	}
};
#endif

NetworkWatcher::NetworkWatcher() = default;
NetworkWatcher::~NetworkWatcher() { Stop(); }

void NetworkWatcher::SetExcludedInterfaces(std::vector<std::string> interfaceIds)
{
	{
		std::lock_guard lock(FMutex);
		FExcludedIds = std::move(interfaceIds);
	}
	Refresh();
}

void NetworkWatcher::Subscribe(Handler handler)
{
	std::lock_guard lock(FMutex);
	FHandlers.push_back(std::move(handler));
}

std::vector<NetworkAddress> NetworkWatcher::AllowedAddresses() const
{
	std::vector<std::string> excluded;
	{
		std::lock_guard lock(FMutex);
		excluded = FExcludedIds;
	}
	std::vector<NetworkAddress> allowed = ListIPv4Addresses();
	allowed.erase(std::remove_if(allowed.begin(), allowed.end(),
								 [&](const NetworkAddress &a)
								 { return std::find(excluded.begin(), excluded.end(), a.InterfaceId) != excluded.end(); }),
				  allowed.end());
	return allowed;
}

void NetworkWatcher::Refresh()
{
	{
		std::lock_guard lock(FMutex);
		FRefreshRequested = true;
	}
	FWakeUp.notify_all();
}

void NetworkWatcher::Start()
{
	if (FThread.joinable())
		return;
	FStopping = false;
	FRefreshRequested = true;
	FThread = std::thread([this]
						  { Run(); });
	FNotifications = std::make_unique<OsNotifications>(*this);
}

void NetworkWatcher::Stop()
{
	FNotifications.reset();
	{
		std::lock_guard lock(FMutex);
		FStopping = true;
	}
	FWakeUp.notify_all();
	if (FThread.joinable())
		JoinPumpingMessages(FThread);
}

void NetworkWatcher::Run()
{
	std::unique_lock lock(FMutex);
	bool retry = false;
	while (!FStopping)
	{
		const auto ready = [this]
		{ return FStopping || FRefreshRequested; };
		if (retry)
			FWakeUp.wait_for(lock, RetryInterval, ready);
		else
			FWakeUp.wait(lock, ready);
		if (FStopping)
			break;

		FRefreshRequested = false;
		const std::vector<Handler> handlers = FHandlers;
		lock.unlock();
		const std::vector<NetworkAddress> allowed = AllowedAddresses();
		retry = false;
		for (const Handler &handler : handlers)
			if (!handler(allowed))
				retry = true;
		lock.lock();
	}
}
