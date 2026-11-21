#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace player
{
	struct PlayerFeatures;
}

namespace webapi
{
	class QueueController : public IApiController
	{
	public:
		QueueController(IAIMPCore *core, const player::PlayerFeatures &features, StateUpdateEvents &events)
			: FCore(core), FFeatures(features), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		StateUpdateEvents &FEvents;
	};
}
