#include "playlistRenameCommand.h"

#include "apiErrors.h"

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "helpers/legacyErrors.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/playlists.h"

void rpcapi::PlaylistRenameCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("PlaylistRename", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		if (!params.contains("new_name") || !params["new_name"].is_string())
			throw RpcError(-32602, "new_name is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();
		const std::string newName = params["new_name"].get<std::string>();

		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::RenamePlaylist(core, idManager.PlaylistGetKey(playlistId), newName); }),
					  {ErrorPlaylistNotFound, "renamePlaylistNotFound"}, {ErrorRenameFailed, "renamePlaylistFailed"});
		return {{"success", true}}; });
}
