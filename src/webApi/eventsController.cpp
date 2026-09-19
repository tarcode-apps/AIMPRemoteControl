#include "eventsController.h"

#include <bitset>
#include <chrono>
#include <string>

#include <nlohmann/json.hpp>

#include "pluginInfo.h"
#include "stateUpdateEvents.h"

namespace
{
	constexpr std::chrono::seconds KeepAliveInterval{30};

	nlohmann::json PlaylistsData(StateUpdateEvents &events)
	{
		nlohmann::json playlists = nlohmann::json::array();
		for (const auto &[id, revision] : events.CurrentPlaylistRevisions())
			playlists.push_back({{"id", id}, {"revision", revision}});
		return {{"playlists", std::move(playlists)}};
	}

	nlohmann::json EventData(StateUpdateEvents &events, int kind)
	{
		switch (kind)
		{
		case StateUpdateEvents::Playlists:
			return PlaylistsData(events);
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
		default:
			return "";
		}
	}
}

void webapi::EventsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapEventStream("/api/v1/events", [&events = FEvents](IEventStream &stream)
					   {
		if (!stream.Send("hello", nlohmann::json{{"pluginVersion", PLUGIN_VERSION_STRING}}.dump()))
			return;

		StateUpdateEvents::Versions seen = events.Current();
		while (!events.IsStopped())
		{
			const std::bitset<StateUpdateEvents::KindCount> changed = events.WaitAny(seen, KeepAliveInterval);
			if (changed.none())
			{
				if (!events.IsStopped() && !stream.Ping())
					return;
				continue;
			}
			for (int kind = 0; kind < StateUpdateEvents::KindCount; ++kind)
				if (changed.test(kind) && !stream.Send(EventName(kind), EventData(events, kind).dump()))
					return;
		} });
}
