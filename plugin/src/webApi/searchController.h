#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	// The extended search: one text over every loaded playlist, or over the named ones.
	class SearchController : public IApiController
	{
	public:
		SearchController(IAIMPCore *core, StateUpdateEvents &events) : FCore(core), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
	};
}
