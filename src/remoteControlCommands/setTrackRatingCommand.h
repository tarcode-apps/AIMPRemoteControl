#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;

class SetTrackRatingCommand : public IRemoteControlCommand
{
public:
	SetTrackRatingCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
		: FCore(core), FIdManager(idManager) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
};
