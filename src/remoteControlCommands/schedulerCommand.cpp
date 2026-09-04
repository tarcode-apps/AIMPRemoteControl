#include "schedulerCommand.h"

#include <chrono>
#include <cmath>
#include <string>

#include <nlohmann/json.hpp>

#include "settings.h"
#include "sleepTimer.h"

namespace
{
	constexpr int ErrorSchedulerUnavailable = -1;

	bool IsTrue(const nlohmann::json &value)
	{
		return (value.is_boolean() && value.get<bool>()) || (value.is_string() && value.get<std::string>() == "true");
	}
}

nlohmann::json SchedulerCommand::BuildTimerState(const SleepTimer &timer)
{
	const SleepTimer::State state = timer.Get();
	if (!state.Active)
		return {{"active", false}};
	return {{"active", true}, {"actions", nlohmann::json::array({state.Action})}, {"expires_in", state.ExpiresInSeconds}};
}

void SchedulerCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Scheduler", [&timer = FTimer, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!settings.Get().Features.Scheduler)
			throw LocalizedRpcError(ErrorSchedulerUnavailable, "schedulerUnavailable");

		if (params.contains("cancel") && IsTrue(params["cancel"]))
			timer.Cancel();
		else if (params.contains("action"))
		{
			const std::string action = params["action"].is_string() ? params["action"].get<std::string>() : std::string();
			if (!SleepTimer::IsSupported(action))
				throw RpcError(-32602, "unsupported action: " + action);
			if (!params.contains("expiration_delay") || !params["expiration_delay"].is_number())
				throw RpcError(-32602, "expiration_delay is required");
			const double seconds = params["expiration_delay"].get<double>();
			if (seconds <= 0)
				throw RpcError(-32602, "expiration_delay must be positive");
			timer.Set(action, std::chrono::seconds(static_cast<long long>(std::llround(seconds))));
		}

		nlohmann::json result{{"supported_actions", SleepTimer::SupportedActions()}};
		const SleepTimer::State state = timer.Get();
		if (state.Active)
			result["current_timer"] = {{"actions", nlohmann::json::array({state.Action})}, {"expires_in", state.ExpiresInSeconds}};
		return result; });
}
