#include "schedulerCommand.h"

#include "apiErrors.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <optional>
#include <string>
#include <utility>

#include <nlohmann/json.hpp>

#include "settings.h"
#include "sleepTimer.h"
#include "helpers/legacyErrors.h"

namespace
{
	// As the web API bounds a timer; beyond it the seconds overflow the clock.
	constexpr std::chrono::hours MaxDelay{24 * 366};

	// The actions the app knows; the web API has more.
	const std::pair<SleepTimer::Action, const char *> LegacyActions[] = {
		{SleepTimer::Action::ClosePlayer, "player_shutdown"},
		{SleepTimer::Action::PausePlayback, "pause_playback"},
		{SleepTimer::Action::Shutdown, "machine_shutdown"},
		{SleepTimer::Action::Sleep, "machine_sleep"},
		{SleepTimer::Action::Hibernate, "machine_hibernate"},
	};

	const char *LegacyName(SleepTimer::Action action)
	{
		for (const auto &[known, name] : LegacyActions)
			if (known == action)
				return name;
		return nullptr;
	}

	std::optional<SleepTimer::Action> ActionFromLegacyName(const std::string &name)
	{
		for (const auto &[action, known] : LegacyActions)
			if (name == known)
				return action;
		return std::nullopt;
	}

	bool IsTrue(const nlohmann::json &value)
	{
		return (value.is_boolean() && value.get<bool>()) || (value.is_string() && value.get<std::string>() == "true");
	}

	nlohmann::json SupportedActions()
	{
		nlohmann::json actions = nlohmann::json::array();
		for (const SleepTimer::Action action : SleepTimer::SupportedActions())
			if (const char *name = LegacyName(action))
				actions.push_back(name);
		return actions;
	}

	// The app's view of the timer: a moment and the actions it knows. A timer
	// waiting for the end of a track, playlist or queue has no moment to show.
	std::optional<nlohmann::json> CurrentTimer(const SleepTimer &timer)
	{
		const SleepTimer::State state = timer.Get();
		if (!state.Active || !SleepTimer::IsTimed(state.When))
			return std::nullopt;
		nlohmann::json actions = nlohmann::json::array();
		for (const SleepTimer::Action action : state.Actions)
			if (const char *name = LegacyName(action))
				actions.push_back(name);
		if (actions.empty())
			return std::nullopt;
		const double left = std::chrono::duration<double>(state.ExpiresAt - SleepTimer::Clock::now()).count();
		return nlohmann::json{{"actions", std::move(actions)}, {"expires_in", static_cast<int>(std::max(0.0, std::round(left)))}};
	}
}

nlohmann::json rpcapi::SchedulerCommand::BuildTimerState(const SleepTimer &timer)
{
	std::optional<nlohmann::json> current = CurrentTimer(timer);
	if (!current)
		return {{"active", false}};
	(*current)["active"] = true;
	return std::move(*current);
}

void rpcapi::SchedulerCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("Scheduler", [&timer = FTimer, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!settings.Get().Features.Scheduler)
			throw LocalizedRpcError(ErrorSchedulerUnavailable, "schedulerUnavailable");

		if (params.contains("cancel") && IsTrue(params["cancel"]))
			timer.Cancel();
		else if (params.contains("action"))
		{
			const std::string name = params["action"].is_string() ? params["action"].get<std::string>() : std::string();
			const std::optional<SleepTimer::Action> action = ActionFromLegacyName(name);
			if (!action || !SleepTimer::IsSupported(*action))
				throw RpcError(-32602, "unsupported action: " + name);
			if (!params.contains("expiration_delay") || !params["expiration_delay"].is_number())
				throw RpcError(-32602, "expiration_delay is required");
			const double seconds = params["expiration_delay"].get<double>();
			if (!(seconds > 0) || seconds > std::chrono::duration<double>(MaxDelay).count())
				throw RpcError(-32602, "expiration_delay must be positive and within a year");
			SleepTimer::Request request;
			request.Actions = {*action};
			request.When = SleepTimer::Trigger::After;
			request.ExpiresAt = SleepTimer::Clock::now() + std::chrono::seconds(static_cast<long long>(std::llround(seconds)));
			timer.Set(request);
		}

		nlohmann::json result{{"supported_actions", SupportedActions()}};
		if (const std::optional<nlohmann::json> current = CurrentTimer(timer))
			result["current_timer"] = *current;
		return result; });
}
