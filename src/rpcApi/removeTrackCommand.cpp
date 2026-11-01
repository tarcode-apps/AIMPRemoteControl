#include "removeTrackCommand.h"

#include "apiErrors.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "helpers/idLookup.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/playlistItems.h"
#include "settings.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;
	constexpr int ErrorRemoveFailed = 28;
}

void rpcapi::RemoveTrackCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("RemoveTrack", [core = FCore, &idManager = FIdManager, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool physically = params.value("physically", false);
		if (physically && !settings.Get().Features.PhysicalDeletion)
			throw LocalizedRpcError(ErrorRemoveFailed, "removeTrackDisabled");

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylist *playlist = nullptr;
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId, &playlist);
			if (!item)
				return E_INVALIDARG;
			INT32 index = -1;
			item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
			const HRESULT hr = player::DeleteItems(playlist, {index}, physically);
			item->Release();
			playlist->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw LocalizedRpcError(ErrorTrackNotFound, "removeTrackNotFound");
		if (Failed(result))
			throw LocalizedRpcError(ErrorRemoveFailed, "removeTrackFailed");
		return {{"success", true}}; });
}
