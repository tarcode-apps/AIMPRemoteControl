#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class CoverIndex;

	class PlayerController : public IApiController
	{
	public:
		PlayerController(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers)
			: FCore(core), FEvents(events), FCovers(covers) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		// The state as `GET /api/v1/player` and the `player` event send it.
		static nlohmann::json Snapshot(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers);

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
	};
}
