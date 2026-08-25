#pragma once

#include <nlohmann/json.hpp>

#include "remoteControlCommand.h"

class IAIMPCore;
class IAIMPPlaylistItem;
class RemoteControlIdManager;

class GetPlayerControlPanelStateCommand : public IRemoteControlCommand
{
public:
	GetPlayerControlPanelStateCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
		: FCore(core), FIdManager(idManager) {}

	void Register(IRpcRegistrar &rpc) override;

	static nlohmann::json BuildState(IAIMPCore *core, RemoteControlIdManager &idManager);
	static IAIMPPlaylistItem *CurrentItem(IAIMPCore *core);

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
};
