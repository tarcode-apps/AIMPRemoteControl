#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace rpcapi
{
	class EnqueueTrackCommand : public IApiController
	{
	public:
		EnqueueTrackCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
