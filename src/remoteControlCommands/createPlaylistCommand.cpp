#include "createPlaylistCommand.h"

#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorPlaylistCreationFailed = 30;
}

void CreatePlaylistCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("CreatePlaylist", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		const std::string title = params.value("title", std::string());

		const std::string aimpId = RunOnMainThread(core, [&]() -> std::string
		{
			std::string result;
			IAIMPServicePlaylistManager *mgr = nullptr;
			if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
				return result;
			IAIMPString *name = title.empty() ? nullptr : StringToIAIMPString(core, title);
			IAIMPPlaylist *playlist = nullptr;
			if (Succeeded(mgr->CreatePlaylist(name, false, &playlist)) && playlist)
			{
				result = GetPlaylistAIMPId(playlist);
				playlist->Release();
			}
			if (name)
				name->Release();
			mgr->Release();
			return result;
		});
		if (aimpId.empty())
			throw RpcError(ErrorPlaylistCreationFailed, "Playlist creation failed.");
		return {{"playlist_id", idManager.PlaylistGetOrGeneratePluginId(aimpId)}}; });
}
