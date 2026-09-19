#pragma once

#include "apiController.h"

class StateUpdateEvents;

namespace webapi
{
	class EventsController : public IApiController
	{
	public:
		explicit EventsController(StateUpdateEvents &events) : FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		StateUpdateEvents &FEvents;
	};
}
