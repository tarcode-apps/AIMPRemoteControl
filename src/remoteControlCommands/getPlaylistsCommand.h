#pragma once

#include <string>
#include <vector>

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;

class GetPlaylistsCommand : public IRemoteControlCommand
{
public:
	GetPlaylistsCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
		: FCore(core), FIdManager(idManager) {}

	void Register(IRpcRegistrar &rpc) override;

	static nlohmann::json BuildPlaylists(IAIMPCore *core, RemoteControlIdManager &idManager,
										 const std::vector<std::string> &fields);

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
};
