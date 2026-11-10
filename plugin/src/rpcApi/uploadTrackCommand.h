#pragma once

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;
class SharedSettings;

namespace rpcapi
{
	class UploadTrackCommand : public IApiController
	{
	public:
		UploadTrackCommand(IAIMPCore *core, RemoteControlIdManager &idManager, const SharedSettings &settings)
			: FCore(core), FIdManager(idManager), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
		const SharedSettings &FSettings;
	};
}
