#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;

class GetPlaylistEntriesCommand : public IRemoteControlCommand
{
public:
	GetPlaylistEntriesCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
		: FCore(core), FIdManager(idManager) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
};
