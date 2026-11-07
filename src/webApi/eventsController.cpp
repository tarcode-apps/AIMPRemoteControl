#include "eventsController.h"

#include <bitset>
#include <chrono>
#include <string>

#include <nlohmann/json.hpp>

#include "effectsController.h"
#include "helpers/coverIndex.h"
#include "playerController.h"
#include "pluginInfo.h"
#include "requestScope.h"
#include "settings.h"
#include "settingsController.h"
#include "stateUpdateEvents.h"
#include "timerController.h"

namespace
{
	constexpr std::chrono::seconds KeepAliveInterval{30};
	constexpr std::chrono::milliseconds BurstInterval{100};

	nlohmann::json PlaylistsData(StateUpdateEvents &events)
	{
		nlohmann::json playlists = nlohmann::json::array();
		for (const auto &[id, revision] : events.CurrentPlaylistRevisions())
			playlists.push_back({{"id", id}, {"revision", revision}});
		return {{"playlists", std::move(playlists)}};
	}

	nlohmann::json QueueData(StateUpdateEvents &events)
	{
		const StateUpdateEvents::QueueInfo queue = events.CurrentQueue();
		return {{"revision", queue.Revision}, {"count", queue.Count}, {"suspended", queue.Suspended}};
	}

	nlohmann::json EventData(IAIMPCore *core, StateUpdateEvents &events, webapi::CoverIndex &covers, const SharedSettings &settings,
							 const SleepTimer &timer, int kind)
	{
		switch (kind)
		{
		case StateUpdateEvents::ControlPanel:
			return webapi::PlayerController::Snapshot(core, events, covers);
		case StateUpdateEvents::Playlists:
			return PlaylistsData(events);
		case StateUpdateEvents::Queue:
			return QueueData(events);
		case StateUpdateEvents::Settings:
			return webapi::SettingsController::ToJson(settings.Get());
		case StateUpdateEvents::Timer:
			return webapi::TimerController::ToJson(timer);
		case StateUpdateEvents::Effects:
			return webapi::EffectsController::ToJson(core, events);
		default:
			return nlohmann::json::object();
		}
	}

	const char *EventName(int kind)
	{
		switch (kind)
		{
		case StateUpdateEvents::ControlPanel:
			return "player";
		case StateUpdateEvents::Playlists:
			return "playlists";
		case StateUpdateEvents::Queue:
			return "queue";
		case StateUpdateEvents::Timer:
			return "timer";
		case StateUpdateEvents::Effects:
			return "effects";
		case StateUpdateEvents::Settings:
			return "settings";
		default:
			return "";
		}
	}
}

void webapi::EventsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapEventStream("/api/v1/events", [core = FCore, &events = FEvents, &covers = FCovers, &settings = FSettings, &timer = FTimer](IEventStream &stream)
					   {
		if (!stream.Send("hello", nlohmann::json{{"pluginVersion", PLUGIN_VERSION_STRING}}.dump()))
			return;

		StateUpdateEvents::Versions seen = events.Current();
		while (!events.IsStopped())
		{
			std::bitset<StateUpdateEvents::KindCount> changed = events.WaitAny(seen, KeepAliveInterval, requestScope::Cancelled);
			// The client went away, or the listener is closing and the client
			// reconnects wherever it still can.
			if (requestScope::Cancelled())
				return;
			if (changed.none())
			{
				if (!events.IsStopped() && !stream.Ping())
					return;
				continue;
			}
			// A track switch raises several player changes in a row, with a stopped
			// player in between, one queue request raises one queue change per item,
			// and a slider dragged in the player's window raises an effects change per
			// step; one event after the burst is what the client wants.
			while ((changed.test(StateUpdateEvents::ControlPanel) || changed.test(StateUpdateEvents::Queue) ||
					changed.test(StateUpdateEvents::Effects)) &&
				   !events.IsStopped())
			{
				const std::bitset<StateUpdateEvents::KindCount> more = events.WaitAny(seen, BurstInterval);
				if (more.none())
					break;
				changed |= more;
			}
			for (int kind = 0; kind < StateUpdateEvents::KindCount; ++kind)
				if (changed.test(kind) && !stream.Send(EventName(kind), EventData(core, events, covers, settings, timer, kind).dump()))
					return;
		} });
}
