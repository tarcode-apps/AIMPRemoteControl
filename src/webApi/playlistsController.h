#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class PlaylistsController : public IApiController
	{
	public:
		PlaylistsController(IAIMPCore *core, StateUpdateEvents &events) : FCore(core), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
	};
}
