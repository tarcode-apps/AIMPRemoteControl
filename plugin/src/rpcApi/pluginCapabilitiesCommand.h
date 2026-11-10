#pragma once

#include "apiController.h"

class SharedSettings;

namespace rpcapi
{
	class PluginCapabilitiesCommand : public IApiController
	{
	public:
		explicit PluginCapabilitiesCommand(const SharedSettings &settings) : FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		const SharedSettings &FSettings;
	};
}
