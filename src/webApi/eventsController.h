#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class EventsController : public IApiController
	{
	public:
		EventsController(IAIMPCore *core, StateUpdateEvents &events) : FCore(core), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
	};
}
