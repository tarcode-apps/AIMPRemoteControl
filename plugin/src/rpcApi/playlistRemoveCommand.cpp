#include "playlistRemoveCommand.h"

#include "apiErrors.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "helpers/legacyErrors.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/playlists.h"

void rpcapi::PlaylistRemoveCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("PlaylistRemove", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();

		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::RemovePlaylist(core, idManager.PlaylistGetKey(playlistId)); }),
					  {ErrorPlaylistNotFound, "removePlaylistNotFound"}, {ErrorPlaylistRemoveFailed, "removePlaylistFailed"});
		return {{"success", true}}; });
}
