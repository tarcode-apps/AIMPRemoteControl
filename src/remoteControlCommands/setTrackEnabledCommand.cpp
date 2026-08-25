#include "setTrackEnabledCommand.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;
}

void SetTrackEnabledCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("SetTrackEnabled", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		if (!params.contains("enabled") || !params["enabled"].is_boolean())
			throw RpcError(-32602, "enabled is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool enabled = params["enabled"].get<bool>();

		const bool found = RunOnMainThread(core, [&]
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return false;
			item->SetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, enabled ? 1 : 0);
			item->Release();
			return true;
		});
		if (!found)
			throw RpcError(ErrorTrackNotFound, "Setting track state failed. Reason: track not found.");
		return {{"success", true}}; });
}
