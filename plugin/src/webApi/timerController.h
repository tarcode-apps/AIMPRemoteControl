#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

class SharedSettings;
class SleepTimer;

namespace webapi
{
	class TimerController : public IApiController
	{
	public:
		TimerController(SleepTimer &timer, const SharedSettings &settings) : FTimer(timer), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		// The timer's state with the actions this computer offers; also the `timer` event.
		static nlohmann::json ToJson(const SleepTimer &timer);

	private:
		SleepTimer &FTimer;
		const SharedSettings &FSettings;
	};
}
