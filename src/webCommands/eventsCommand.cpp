#include "eventsCommand.h"

#include <bitset>
#include <chrono>

#include <nlohmann/json.hpp>

#include "pluginInfo.h"
#include "stateUpdateEvents.h"

namespace
{
	constexpr std::chrono::seconds KeepAliveInterval{30};

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

void web::EventsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.AddEventStream("/api/v1/events", [&events = FEvents](IEventStream &stream)
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
				if (changed.test(kind) && !stream.Send(EventName(kind), "{}"))
					return;
		} });
}
