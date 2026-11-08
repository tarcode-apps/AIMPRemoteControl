#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace rpcapi
{
	class PlayCommand : public IApiController
	{
	public:
		PlayCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
