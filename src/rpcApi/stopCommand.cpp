#include "stopCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlayer.h"
#include "getPlayerControlPanelStateCommand.h"
#include "helpers/jsonHelper.h"
#include "mainThreadRunner.h"

void rpcapi::StopCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("Stop", [core = FCore, &idManager = FIdManager](const nlohmann::json &) -> nlohmann::json
			{ return RunOnMainThread(core, [&]() -> nlohmann::json
									 {
			const nlohmann::json before = GetPlayerControlPanelStateCommand::BuildState(core, idManager);
			IAIMPServicePlayer *player = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
			{
				player->Stop();
				player->Release();
			}
			return PickFields(before, {"playback_state"}); }); });
}
