#pragma once

#include "apiController.h"

class IAIMPCore;

namespace rpcapi
{
	class EqualizerCommand : public IApiController
	{
	public:
		explicit EqualizerCommand(IAIMPCore *core) : FCore(core) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
	};
}
