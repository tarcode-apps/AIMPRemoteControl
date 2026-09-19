#pragma once

#include "apiController.h"

class IAIMPCore;

namespace rpcapi
{
	class ShowMessageCommand : public IApiController
	{
	public:
		explicit ShowMessageCommand(IAIMPCore *core) : FCore(core) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
	};
}
