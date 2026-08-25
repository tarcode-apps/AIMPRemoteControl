#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;
class SharedSettings;

class RemoveTrackCommand : public IRemoteControlCommand
{
public:
	RemoveTrackCommand(IAIMPCore *core, RemoteControlIdManager &idManager, const SharedSettings &settings)
		: FCore(core), FIdManager(idManager), FSettings(settings) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
	const SharedSettings &FSettings;
};
