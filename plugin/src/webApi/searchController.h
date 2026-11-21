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
	// The extended search: one text over every loaded playlist, or over the named ones.
	class SearchController : public IApiController
	{
	public:
		SearchController(IAIMPCore *core, const player::PlayerFeatures &features, StateUpdateEvents &events)
			: FCore(core), FFeatures(features), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		StateUpdateEvents &FEvents;
	};
}
