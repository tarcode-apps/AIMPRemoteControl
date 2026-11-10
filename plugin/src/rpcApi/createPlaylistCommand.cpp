#include "createPlaylistCommand.h"

#include "apiErrors.h"

#include <string>

#include <nlohmann/json.hpp>

#include "mainThreadRunner.h"
#include "helpers/legacyErrors.h"
#include "helpers/remoteControlIdManager.h"
#include "player/playlists.h"

void rpcapi::CreatePlaylistCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("CreatePlaylist", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		const std::string title = params.value("title", std::string());

		const std::string aimpId = RunOnMainThread(core, [&]
												   { return player::CreatePlaylist(core, title); });
		if (aimpId.empty())
			throw LocalizedRpcError(ErrorPlaylistCreationFailed, "playlistCreationFailed");
		return {{"playlist_id", idManager.PlaylistGetOrGeneratePluginId(aimpId)}}; });
}
