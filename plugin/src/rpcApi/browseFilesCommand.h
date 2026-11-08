#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;

namespace rpcapi
{
	class BrowseFilesCommand : public IApiController
	{
	public:
		BrowseFilesCommand(IAIMPCore *core, const SharedSettings &settings) : FCore(core), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const SharedSettings &FSettings;
	};
}
