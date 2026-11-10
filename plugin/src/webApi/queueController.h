#pragma once

#include "apiController.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class QueueController : public IApiController
	{
	public:
		QueueController(IAIMPCore *core, StateUpdateEvents &events) : FCore(core), FEvents(events) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
	};
}
