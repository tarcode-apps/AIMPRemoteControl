#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;
class SleepTimer;
class StateUpdateEvents;

namespace player
{
	struct PlayerFeatures;
}

namespace rpcapi
{
	class SubscribeOnAIMPStateUpdateEventCommand : public IApiController
	{
	public:
		SubscribeOnAIMPStateUpdateEventCommand(IAIMPCore *core, const player::PlayerFeatures &features, RemoteControlIdManager &idManager,
											   StateUpdateEvents &events, const SleepTimer &timer)
			: FCore(core), FFeatures(features), FIdManager(idManager), FEvents(events), FTimer(timer) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		RemoteControlIdManager &FIdManager;
		StateUpdateEvents &FEvents;
		const SleepTimer &FTimer;
	};
}
