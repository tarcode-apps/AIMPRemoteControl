#pragma once

#include <memory>

class NetworkWatcher;
class SharedSettings;

class AIMPServiceDiscoveryServer
{
public:
	static constexpr unsigned short DiscoveryPort = 3332;

	AIMPServiceDiscoveryServer();
	~AIMPServiceDiscoveryServer();

	AIMPServiceDiscoveryServer(const AIMPServiceDiscoveryServer &) = delete;
	AIMPServiceDiscoveryServer &operator=(const AIMPServiceDiscoveryServer &) = delete;

	// Answers every request with the player's name of the settings, as they are then.
	bool Start(NetworkWatcher &network, const SharedSettings &settings);
	void Stop();

private:
	struct Impl;
	std::unique_ptr<Impl> FImpl;
};
