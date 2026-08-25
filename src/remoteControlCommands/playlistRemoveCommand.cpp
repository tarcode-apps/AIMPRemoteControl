#include "playlistRemoveCommand.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorPlaylistNotFound = 20;
	constexpr int ErrorPlaylistRemoveFailed = 31;
}

void PlaylistRemoveCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("PlaylistRemove", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId);
			if (!playlist)
				return E_INVALIDARG;
			const HRESULT hr = playlist->Close(AIMP_PLAYLIST_CLOSE_FLAGS_FORCE_REMOVE);
			playlist->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw RpcError(ErrorPlaylistNotFound, "Removing playlist failed. Reason: playlist not found.");
		if (Failed(result))
			throw RpcError(ErrorPlaylistRemoveFailed, "Removing playlist failed.");
		return {{"success", true}}; });
}
