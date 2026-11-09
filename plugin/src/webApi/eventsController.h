#pragma once

#include <string>

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
						 const SleepTimer &timer);

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
		const SharedSettings &FSettings;
		const SleepTimer &FTimer;
		const std::string FAIMPVersion;
	};
}
