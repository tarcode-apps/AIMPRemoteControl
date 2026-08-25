#include "addFilesCommand.h"

#include <cstdint>
#include <string>
#include <vector>

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

void AddFilesCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("AddFiles", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		if (!params.contains("files") || !params["files"].is_array())
			throw RpcError(-32602, "files is required");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();
		const std::vector<std::string> files = params["files"].get<std::vector<std::string>>();

		const HRESULT result = RunOnMainThread(core, [&] { return AddFilesToPlaylist(core, idManager, playlistId, files); });
		if (result == E_INVALIDARG)
			throw RpcError(ErrorPlaylistNotFound, "Adding files failed. Reason: playlist not found.");
		if (Failed(result))
			throw RpcError(ErrorAddFailed, "Adding files failed.");
		return {{"success", true}}; });
}
