#pragma once

#include <memory>

class NetworkWatcher;

class AIMPServiceDiscoveryServer
{
public:
	static constexpr unsigned short DiscoveryPort = 3332;

	AIMPServiceDiscoveryServer();
	~AIMPServiceDiscoveryServer();

	AIMPServiceDiscoveryServer(const AIMPServiceDiscoveryServer &) = delete;
	AIMPServiceDiscoveryServer &operator=(const AIMPServiceDiscoveryServer &) = delete;

	bool Start(NetworkWatcher &network);
	void Stop();

private:
	struct Impl;
	std::unique_ptr<Impl> FImpl;
};
