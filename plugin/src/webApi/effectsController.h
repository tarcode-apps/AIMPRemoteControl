#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class EffectsController : public IApiController
	{
	public:
		EffectsController(IAIMPCore *core, StateUpdateEvents &events) : FCore(core), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		// The state as `GET /api/v1/effects` and the `effects` event send it.
		static nlohmann::json ToJson(IAIMPCore *core, StateUpdateEvents &events);

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
	};
}
