#pragma once

#include "apiController.h"

class IAIMPCore;

namespace rpcapi
{
	class GetFormatsCommand : public IApiController
	{
	public:
		explicit GetFormatsCommand(IAIMPCore *core) : FCore(core) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
	};
}
