#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace rpcapi
{
	class RemoveTrackFromPlayQueueCommand : public IApiController
	{
	public:
		RemoveTrackFromPlayQueueCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
