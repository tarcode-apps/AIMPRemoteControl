#include "playPreviousCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlayer.h"
#include "aimpHelper.h"
#include "getPlayerControlPanelStateCommand.h"
#include "jsonHelper.h"
#include "mainThreadRunner.h"
#include "stateUpdateEvents.h"

void PlayPreviousCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("PlayPrevious", [core = FCore, &idManager = FIdManager, &events = FEvents](const nlohmann::json &) -> nlohmann::json
			{
		bool focusMoved = false;
		const nlohmann::json before = RunOnMainThread(core, [&]() -> nlohmann::json
		{
			const nlohmann::json before = GetPlayerControlPanelStateCommand::BuildState(core, idManager);
			IAIMPServicePlayer *player = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
			{
				if (player->GetState() == AIMP_PLAYER_STATE_STOPPED)
				{
					if (IAIMPPlaylistItem *item = GetPlayerControlPanelStateCommand::CurrentItem(core))
					{
						focusMoved = MoveFocus(item, -1);
						item->Release();
					}
				}
				else
					player->GoToPrev();
				player->Release();
			}
			return before;
		});
		if (focusMoved)
			events.Notify(StateUpdateEvents::ControlPanel);
		return PickFields(before, {"playlist_id", "track_id"}); });
}
