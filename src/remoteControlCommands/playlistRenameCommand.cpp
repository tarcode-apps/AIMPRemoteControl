#include "playlistRenameCommand.h"

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorPlaylistNotFound = 20;
	constexpr int ErrorRenameFailed = 29;
}

void PlaylistRenameCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("PlaylistRename", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		if (!params.contains("new_name") || !params["new_name"].is_string())
			throw RpcError(-32602, "new_name is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();
		const std::string newName = params["new_name"].get<std::string>();

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId);
			if (!playlist)
				return E_INVALIDARG;
			HRESULT hr = E_FAIL;
			IAIMPPlaylistProperties *props = nullptr;
			if (Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
			{
				if (IAIMPString *name = StringToIAIMPString(core, newName))
				{
					hr = props->SetValueAsObject(AIMP_PLAYLIST_PROPID_NAME, name);
					name->Release();
				}
				props->Release();
			}
			playlist->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw RpcError(ErrorPlaylistNotFound, "Renaming playlist failed. Reason: playlist not found.");
		if (Failed(result))
			throw RpcError(ErrorRenameFailed, "Renaming playlist failed.");
		return {{"success", true}}; });
}
