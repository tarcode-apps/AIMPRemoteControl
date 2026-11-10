#include "setTrackEnabledCommand.h"

#include "apiErrors.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "helpers/legacyErrors.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/playlistItems.h"

void rpcapi::SetTrackEnabledCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("SetTrackEnabled", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		if (!params.contains("enabled") || !params["enabled"].is_boolean())
			throw RpcError(-32602, "enabled is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool enabled = params["enabled"].get<bool>();

		const PlaylistItemKey key = idManager.PlaylistItemGetKey(trackId);
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::SetItemEnabled(core, key.AIMPPlaylistId, key.Index, enabled); });
		if (result == player::MutationResult::PlaylistNotFound || result == player::MutationResult::ItemNotFound)
			throw LocalizedRpcError(ErrorTrackNotFound, "setTrackEnabledTrackNotFound");
		// The protocol has no code for a refusal, as ShowMessage has none.
		return {{"success", result == player::MutationResult::Ok}}; });
}
