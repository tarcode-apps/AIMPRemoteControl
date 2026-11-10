#pragma once

#include "apiController.h"

class IAIMPCore;

namespace rpcapi
{
	class VersionCommand : public IApiController
	{
	public:
		explicit VersionCommand(IAIMPCore *core) : FCore(core) {}
		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
	};
}
