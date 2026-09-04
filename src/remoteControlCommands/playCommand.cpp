#include "playCommand.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "getPlayerControlPanelStateCommand.h"
#include "jsonHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;
}

void PlayCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Play", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		const nlohmann::json result = RunOnMainThread(core, [&]() -> nlohmann::json
		{
			IAIMPPlaylist *playlist = nullptr;
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId, &playlist);
			if (!item)
				return nullptr;
			nlohmann::json before = PickFields(GetPlayerControlPanelStateCommand::BuildState(core, idManager), {"playback_state", "playlist_id", "track_id"});
			if (!before.contains("playlist_id"))
			{
				before["playlist_id"] = idManager.PlaylistGetOrGeneratePluginId(GetPlaylistAIMPId(playlist));
				before["track_id"] = trackId;
			}
			playlist->Release();
			IAIMPServicePlayer *player = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
			{
				player->Play2(item);
				player->Release();
			}
			item->Release();
			return before;
		});
		if (result.is_null())
			throw LocalizedRpcError(ErrorTrackNotFound, "playTrackNotFound");
		return result; });
}
