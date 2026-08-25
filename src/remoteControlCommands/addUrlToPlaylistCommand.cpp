#include "addUrlToPlaylistCommand.h"

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorPlaylistNotFound = 20;
	constexpr int ErrorAddFailed = 27;
}

void AddUrlToPlaylistCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("AddURLToPlaylist", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		if (!params.contains("url") || !params["url"].is_string())
			throw RpcError(-32602, "url is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();
		const std::string url = params["url"].get<std::string>();

		const HRESULT result = RunOnMainThread(core, [&] { return AddFilesToPlaylist(core, idManager, playlistId, {url}); });
		if (result == E_INVALIDARG)
			throw RpcError(ErrorPlaylistNotFound, "Adding URL failed. Reason: playlist not found.");
		if (Failed(result))
			throw RpcError(ErrorAddFailed, "Adding URL failed.");
		return nullptr; });
}
