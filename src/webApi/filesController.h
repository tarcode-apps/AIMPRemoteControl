#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;

namespace webapi
{
	class FilesController : public IApiController
	{
	public:
		FilesController(IAIMPCore *core, const SharedSettings &settings) : FCore(core), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const SharedSettings &FSettings;
	};
}
