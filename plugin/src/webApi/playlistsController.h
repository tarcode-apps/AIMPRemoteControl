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
	class PlaylistsController : public IApiController
	{
	public:
		PlaylistsController(IAIMPCore *core, const player::PlayerFeatures &features, StateUpdateEvents &events, const SharedSettings &settings)
			: FCore(core), FFeatures(features), FEvents(events), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		StateUpdateEvents &FEvents;
		const SharedSettings &FSettings;
	};
}
