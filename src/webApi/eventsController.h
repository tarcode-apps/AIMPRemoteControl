#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class CoverIndex;

	class EventsController : public IApiController
	{
	public:
		EventsController(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers)
			: FCore(core), FEvents(events), FCovers(covers) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
	};
}
