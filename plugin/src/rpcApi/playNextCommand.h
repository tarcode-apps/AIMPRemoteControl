#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;
class StateUpdateEvents;

namespace rpcapi
{
	class PlayNextCommand : public IApiController
	{
	public:
		PlayNextCommand(IAIMPCore *core, RemoteControlIdManager &idManager, StateUpdateEvents &events)
			: FCore(core), FIdManager(idManager), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
		StateUpdateEvents &FEvents;
	};
}
