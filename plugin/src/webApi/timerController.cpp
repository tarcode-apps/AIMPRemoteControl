#include "timerController.h"

#include "apiErrors.h"

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <string>
#include <vector>

#include "helpers/requestHelpers.h"
#include "settings.h"
#include "sleepTimer.h"

namespace
{
	using webapi::OptionalField;
	using webapi::StringArray;

	// A delay or a moment further away than this is a mistake.
	constexpr std::chrono::hours MaxAhead{24 * 366};
	constexpr int MaxTracks = 1000;

	const char *ActionName(SleepTimer::Action action)
	{
		switch (action)
		{
		case SleepTimer::Action::PausePlayback:
			return "pause";
		case SleepTimer::Action::ClosePlayer:
			return "closePlayer";
		case SleepTimer::Action::Shutdown:
			return "shutdown";
		case SleepTimer::Action::Sleep:
			return "sleep";
		case SleepTimer::Action::Hibernate:
			return "hibernate";
		case SleepTimer::Action::Reboot:
			return "reboot";
		case SleepTimer::Action::LogOff:
			return "logOff";
		}
		return "";
	}

	const char *TriggerName(SleepTimer::Trigger when)
	{
		switch (when)
		{
		case SleepTimer::Trigger::After:
			return "after";
		case SleepTimer::Trigger::At:
			return "at";
		case SleepTimer::Trigger::TrackEnd:
			return "trackEnd";
		case SleepTimer::Trigger::PlaylistEnd:
			return "playlistEnd";
		case SleepTimer::Trigger::QueueEnd:
			return "queueEnd";
		}
		return "";
	}

	SleepTimer::Action ActionFromName(const std::string &name)
	{
		for (const SleepTimer::Action action : SleepTimer::SupportedActions())
			if (name == ActionName(action))
				return action;
		throw ApiError(400, "invalidBody");
	}

	SleepTimer::Trigger TriggerFromName(const std::string &name)
	{
		for (const SleepTimer::Trigger when : {SleepTimer::Trigger::After, SleepTimer::Trigger::At, SleepTimer::Trigger::TrackEnd,
											   SleepTimer::Trigger::PlaylistEnd, SleepTimer::Trigger::QueueEnd})
			if (name == TriggerName(when))
				return when;
		throw ApiError(400, "invalidBody");
	}

	std::int64_t ToMilliseconds(SleepTimer::Clock::time_point time)
	{
		return std::chrono::duration_cast<std::chrono::milliseconds>(time.time_since_epoch()).count();
	}

	SleepTimer::Request ParseRequest(const nlohmann::json &body)
	{
		if (!body.is_object())
			throw ApiError(400, "invalidBody");
		SleepTimer::Request request;
		for (const std::string &name : StringArray(body, "actions", true))
			request.Actions.push_back(ActionFromName(name));
		std::sort(request.Actions.begin(), request.Actions.end());
		request.Actions.erase(std::unique(request.Actions.begin(), request.Actions.end()), request.Actions.end());
		// The computer can do one thing.
		if (std::count_if(request.Actions.begin(), request.Actions.end(), [](SleepTimer::Action action)
						  { return action != SleepTimer::Action::PausePlayback && action != SleepTimer::Action::ClosePlayer; }) > 1)
			throw ApiError(400, "invalidBody");

		const std::optional<std::string> trigger = OptionalField<std::string>(body, "trigger", &nlohmann::json::is_string);
		if (!trigger)
			throw ApiError(400, "invalidBody");
		request.When = TriggerFromName(*trigger);
		if (request.When == SleepTimer::Trigger::TrackEnd)
		{
			request.Tracks = OptionalField<int>(body, "tracks", &nlohmann::json::is_number_integer).value_or(1);
			if (request.Tracks < 1 || request.Tracks > MaxTracks)
				throw ApiError(400, "invalidBody");
		}
		if (!SleepTimer::IsTimed(request.When))
			return request;

		const auto now = SleepTimer::Clock::now();
		if (request.When == SleepTimer::Trigger::After)
		{
			const std::optional<double> seconds = OptionalField<double>(body, "seconds", &nlohmann::json::is_number);
			if (!seconds || !(*seconds > 0) || *seconds > std::chrono::duration<double>(MaxAhead).count())
				throw ApiError(400, "invalidBody");
			request.ExpiresAt = now + std::chrono::duration_cast<SleepTimer::Clock::duration>(std::chrono::duration<double>(*seconds));
		}
		else
		{
			const std::optional<std::int64_t> at = OptionalField<std::int64_t>(body, "at", &nlohmann::json::is_number_integer);
			if (!at || *at <= ToMilliseconds(now) || *at > ToMilliseconds(now + MaxAhead))
				throw ApiError(400, "invalidBody");
			request.ExpiresAt = SleepTimer::Clock::time_point(std::chrono::milliseconds(*at));
		}
		request.WaitTrackEnd = OptionalField<bool>(body, "waitTrackEnd", &nlohmann::json::is_boolean).value_or(false);
		return request;
	}

	void RequireScheduler(const SharedSettings &settings)
	{
		if (!settings.Get().Features.Scheduler)
			throw ApiError(403, "schedulerDisabled");
	}
}

nlohmann::json webapi::TimerController::ToJson(const SleepTimer &timer)
{
	nlohmann::json supported = nlohmann::json::array();
	for (const SleepTimer::Action action : SleepTimer::SupportedActions())
		supported.push_back(ActionName(action));

	nlohmann::json current = nullptr;
	const SleepTimer::State state = timer.Get();
	if (state.Active)
	{
		nlohmann::json actions = nlohmann::json::array();
		for (const SleepTimer::Action action : state.Actions)
			actions.push_back(ActionName(action));
		current = {{"actions", std::move(actions)}, {"trigger", TriggerName(state.When)}};
		if (SleepTimer::IsTimed(state.When))
		{
			current["setAt"] = ToMilliseconds(state.SetAt);
			current["expiresAt"] = ToMilliseconds(state.ExpiresAt);
			current["waitTrackEnd"] = state.WaitTrackEnd;
			current["waitingTrackEnd"] = state.WaitingTrackEnd;
		}
		else
		{
			current["tracksEnded"] = state.TracksEnded;
			if (state.When == SleepTimer::Trigger::TrackEnd)
			{
				current["tracks"] = state.Tracks;
				current["tracksLeft"] = state.TracksLeft;
			}
		}
	}
	return {{"supportedActions", std::move(supported)}, {"timer", std::move(current)}};
}

void webapi::TimerController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/timer", [&timer = FTimer, &settings = FSettings](const ApiRequest &) -> nlohmann::json
			   {
		RequireScheduler(settings);
		return ToJson(timer); });

	endpoints.MapApi(HttpMethod::Put, "/api/v1/timer", [&timer = FTimer, &settings = FSettings](const ApiRequest &request) -> nlohmann::json
			   {
		RequireScheduler(settings);
		timer.Set(ParseRequest(request.Body));
		return ToJson(timer); });

	endpoints.MapApi(HttpMethod::Delete, "/api/v1/timer", [&timer = FTimer, &settings = FSettings](const ApiRequest &) -> nlohmann::json
			   {
		RequireScheduler(settings);
		timer.Cancel();
		return nlohmann::json::object(); });
}
