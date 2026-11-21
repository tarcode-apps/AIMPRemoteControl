#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;
class StateUpdateEvents;

namespace player
{
	struct PlayerFeatures;
}

namespace webapi
{
	// What is done to a selection of items, which may lie in several playlists.
	class ItemsController : public IApiController
	{
	public:
		ItemsController(IAIMPCore *core, const player::PlayerFeatures &features, StateUpdateEvents &events, const SharedSettings &settings)
			: FCore(core), FFeatures(features), FEvents(events), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		StateUpdateEvents &FEvents;
		const SharedSettings &FSettings;
	};
}
