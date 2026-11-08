#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;
class StateUpdateEvents;

namespace rpcapi
{
	class PlayPreviousCommand : public IApiController
	{
	public:
		PlayPreviousCommand(IAIMPCore *core, RemoteControlIdManager &idManager, StateUpdateEvents &events)
			: FCore(core), FIdManager(idManager), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
		StateUpdateEvents &FEvents;
	};
}
