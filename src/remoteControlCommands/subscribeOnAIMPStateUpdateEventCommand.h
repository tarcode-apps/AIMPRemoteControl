#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;
class SleepTimer;
class StateUpdateEvents;

class SubscribeOnAIMPStateUpdateEventCommand : public IRemoteControlCommand
{
public:
	SubscribeOnAIMPStateUpdateEventCommand(IAIMPCore *core, RemoteControlIdManager &idManager, StateUpdateEvents &events,
										   const SleepTimer &timer)
		: FCore(core), FIdManager(idManager), FEvents(events), FTimer(timer) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
	StateUpdateEvents &FEvents;
	const SleepTimer &FTimer;
};
