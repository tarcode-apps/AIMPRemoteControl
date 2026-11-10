#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;
class SleepTimer;
class StateUpdateEvents;

namespace rpcapi
{
	class SubscribeOnAIMPStateUpdateEventCommand : public IApiController
	{
	public:
		SubscribeOnAIMPStateUpdateEventCommand(IAIMPCore *core, RemoteControlIdManager &idManager, StateUpdateEvents &events,
											   const SleepTimer &timer)
			: FCore(core), FIdManager(idManager), FEvents(events), FTimer(timer) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
		StateUpdateEvents &FEvents;
		const SleepTimer &FTimer;
	};
}
