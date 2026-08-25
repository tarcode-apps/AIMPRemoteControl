#pragma once

#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

#include "networkInterfaces.h"

class NetworkWatcher
{
public:
	using Handler = std::function<bool(const std::vector<NetworkAddress> &allowed)>;

	NetworkWatcher();
	~NetworkWatcher();

	void SetExcludedInterfaces(std::vector<std::string> interfaceIds);
	void Subscribe(Handler handler);
	std::vector<NetworkAddress> AllowedAddresses() const;

	void Start();
	void Stop();

private:
	struct OsNotifications;

	void Refresh();
	void Run();

	mutable std::mutex FMutex;
	std::condition_variable FWakeUp;
	std::vector<std::string> FExcludedIds;
	std::vector<Handler> FHandlers;
	std::thread FThread;
	std::unique_ptr<OsNotifications> FNotifications;
	bool FStopping = false;
	bool FRefreshRequested = false;
};
