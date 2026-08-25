#include "pauseCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "getPlayerControlPanelStateCommand.h"
#include "jsonHelper.h"
#include "mainThreadRunner.h"

void PauseCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Pause", [core = FCore, &idManager = FIdManager](const nlohmann::json &) -> nlohmann::json
			{ return RunOnMainThread(core, [&]() -> nlohmann::json
									 {
			const nlohmann::json before = GetPlayerControlPanelStateCommand::BuildState(core, idManager);
			IAIMPServicePlayer *player = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
			{
				switch (player->GetState())
				{
				case AIMP_PLAYER_STATE_PLAYING:
					player->Pause();
					break;
				case AIMP_PLAYER_STATE_PAUSED:
					player->Resume();
					break;
				default:
					if (IAIMPPlaylistItem *item = GetPlayerControlPanelStateCommand::CurrentItem(core))
					{
						player->Play2(item);
						item->Release();
					}
					break;
				}
				player->Release();
			}
			return PickFields(before, {"playback_state"}); }); });
}
