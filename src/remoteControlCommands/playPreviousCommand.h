#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;
class StateUpdateEvents;

class PlayPreviousCommand : public IRemoteControlCommand
{
public:
	PlayPreviousCommand(IAIMPCore *core, RemoteControlIdManager &idManager, StateUpdateEvents &events)
		: FCore(core), FIdManager(idManager), FEvents(events) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
	StateUpdateEvents &FEvents;
};
