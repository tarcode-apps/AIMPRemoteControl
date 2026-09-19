#pragma once

#include "apiController.h"

class SharedSettings;
class SleepTimer;

namespace rpcapi
{
	class SchedulerCommand : public IApiController
	{
	public:
		SchedulerCommand(SleepTimer &timer, const SharedSettings &settings) : FTimer(timer), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		static nlohmann::json BuildTimerState(const SleepTimer &timer);

	private:
		SleepTimer &FTimer;
		const SharedSettings &FSettings;
	};
}
