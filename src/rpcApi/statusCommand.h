#pragma once

#include "apiController.h"

class IAIMPCore;

namespace rpcapi
{
	class StatusCommand : public IApiController
	{
	public:
		explicit StatusCommand(IAIMPCore *core) : FCore(core) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
	};
}
