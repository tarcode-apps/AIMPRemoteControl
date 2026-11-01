#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;
class SleepTimer;
class StateUpdateEvents;

namespace webapi
{
	class CoverIndex;

	class EventsController : public IApiController
	{
	public:
		EventsController(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers, const SharedSettings &settings,
						 const SleepTimer &timer)
			: FCore(core), FEvents(events), FCovers(covers), FSettings(settings), FTimer(timer) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
		const SharedSettings &FSettings;
		const SleepTimer &FTimer;
	};
}
