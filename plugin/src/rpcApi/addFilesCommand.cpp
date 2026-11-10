#include "addFilesCommand.h"

#include "apiErrors.h"

#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "aimpHelper.h"
#include "helpers/legacyErrors.h"
#include "helpers/idLookup.h"
#include "helpers/permissions.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "settings.h"

void rpcapi::AddFilesCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("AddFiles", [core = FCore, &idManager = FIdManager, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("playlist_id") || !params["playlist_id"].is_number_integer())
			throw RpcError(-32602, "playlist_id is required");
		if (!params.contains("files") || !params["files"].is_array())
			throw RpcError(-32602, "files is required");
		if (!CanBrowseFiles(settings.Get().Features))
			throw LocalizedRpcError(ErrorAddFailed, "addFilesDisabled");
		const std::int32_t playlistId = params["playlist_id"].get<std::int32_t>();
		const std::vector<std::string> files = params["files"].get<std::vector<std::string>>();

		const HRESULT result = RunOnMainThread(core, [&] { return AddFilesByPlaylistId(core, idManager, playlistId, files); });
		if (result == E_INVALIDARG)
			throw LocalizedRpcError(ErrorPlaylistNotFound, "addFilesPlaylistNotFound");
		if (Failed(result))
			throw LocalizedRpcError(ErrorAddFailed, "addFilesFailed");
		return {{"success", true}}; });
}
