#include "removeTrackCommand.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"
#include "settings.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;
	constexpr int ErrorRemoveFailed = 28;

	BOOL WINAPI DeleteOnlyIndex(IAIMPPlaylistItem *item, void *userData)
	{
		INT32 index = -1;
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
		return index == *static_cast<const INT32 *>(userData);
	}
}

void RemoveTrackCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("RemoveTrack", [core = FCore, &idManager = FIdManager, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool physically = params.value("physically", false);
		if (physically && !settings.Get().Features.PhysicalDeletion)
			throw RpcError(ErrorRemoveFailed, "Removing track failed. Reason: physical deletion is disabled in the plugin settings.");

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylist *playlist = nullptr;
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId, &playlist);
			if (!item)
				return E_INVALIDARG;
			HRESULT hr;
			if (physically)
			{
				INT32 index = -1;
				item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
				hr = playlist->Delete3(AIMP_PLAYLIST_DELETE_FLAGS_PHYSICALLY | AIMP_PLAYLIST_DELETE_FLAGS_NOCONFIRMATION, DeleteOnlyIndex, &index);
			}
			else
				hr = playlist->Delete(item);
			item->Release();
			playlist->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw RpcError(ErrorTrackNotFound, "Removing track failed. Reason: track not found.");
		if (Failed(result))
			throw RpcError(ErrorRemoveFailed, "Removing track failed.");
		return {{"success", true}}; });
}
