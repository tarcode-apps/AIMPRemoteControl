#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace player
{
	struct PlayerFeatures;
}

namespace webapi
{
	class CoverIndex;

	class PlayerController : public IApiController
	{
	public:
		PlayerController(IAIMPCore *core, const player::PlayerFeatures &features, StateUpdateEvents &events, CoverIndex &covers)
			: FCore(core), FFeatures(features), FEvents(events), FCovers(covers) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		// The state as `GET /api/v1/player` and the `player` event send it.
		static nlohmann::json Snapshot(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers);

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
	};
}
