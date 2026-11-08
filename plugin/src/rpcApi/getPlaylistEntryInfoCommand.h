#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace rpcapi
{
	class GetPlaylistEntryInfoCommand : public IApiController
	{
	public:
		GetPlaylistEntryInfoCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
