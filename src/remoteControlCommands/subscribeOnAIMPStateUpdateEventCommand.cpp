#include "subscribeOnAIMPStateUpdateEventCommand.h"

#include <chrono>
#include <string>

#include "getPlayerControlPanelStateCommand.h"
#include "getPlaylistsCommand.h"
#include "mainThreadRunner.h"
#include "schedulerCommand.h"
#include "stateUpdateEvents.h"

namespace
{
	constexpr std::chrono::minutes LongPollTimeout{10};

	StateUpdateEvents::Kind KindFor(const std::string &event)
	{
		if (event == "control_panel_state_change")
			return StateUpdateEvents::ControlPanel;
		if (event == "playlists_content_change")
			return StateUpdateEvents::Playlists;
		if (event == "queue_content_change")
			return StateUpdateEvents::Queue;
		if (event == "timer_state_change")
			return StateUpdateEvents::Timer;
		throw RpcError(-32602, "unknown event: " + event);
	}
}

void SubscribeOnAIMPStateUpdateEventCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("SubscribeOnAIMPStateUpdateEvent",
			[core = FCore, &idManager = FIdManager, &events = FEvents, &timer = FTimer](const nlohmann::json &params) -> nlohmann::json
			{
				const StateUpdateEvents::Kind kind = KindFor(params.value("event", std::string()));

				if (!events.Wait(kind, LongPollTimeout) && events.IsStopped())
					throw RpcError(-32000, "server is stopping");

				switch (kind)
				{
				case StateUpdateEvents::ControlPanel:
					return RunOnMainThread(core, [&]
										   { return GetPlayerControlPanelStateCommand::BuildState(core, idManager); });
				case StateUpdateEvents::Playlists:
					return {{"event", "playlists_changed"},
							{"playlists", RunOnMainThread(core, [&]
														  { return GetPlaylistsCommand::BuildPlaylists(core, idManager, {"id", "crc32"}); })}};
				case StateUpdateEvents::Timer:
					return SchedulerCommand::BuildTimerState(timer);
				case StateUpdateEvents::Queue:
					return {{"changed", true}};
				default:
					return nlohmann::json::object();
				}
			});
}
