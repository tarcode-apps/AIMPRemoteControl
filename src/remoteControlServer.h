#pragma once

#include <functional>
#include <memory>
#include <string>
#include <vector>

#include "settings.h"

class IRemoteControlCommand;
class NetworkWatcher;

class AIMPRemoteControlServer
{
public:
	static constexpr unsigned short DefaultPort = 3333;

	AIMPRemoteControlServer(std::vector<std::unique_ptr<IRemoteControlCommand>> commands, NetworkWatcher &network);
	~AIMPRemoteControlServer();

	AIMPRemoteControlServer(const AIMPRemoteControlServer &) = delete;
	AIMPRemoteControlServer &operator=(const AIMPRemoteControlServer &) = delete;

	bool Start(unsigned short port = DefaultPort);
	void OnBindFailure(std::function<void(const std::string &address, unsigned short port)> handler);
	void Stop();

	void ApplySettings(const Settings &settings);

private:
	struct Impl;
	std::unique_ptr<Impl> FImpl;
};
