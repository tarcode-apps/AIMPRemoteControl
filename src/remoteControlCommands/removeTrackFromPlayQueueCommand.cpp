#include "removeTrackFromPlayQueueCommand.h"

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
	constexpr int ErrorDequeueFailed = 19;
}

void RemoveTrackFromPlayQueueCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("RemoveTrackFromPlayQueue", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return E_INVALIDARG;
			HRESULT hr = E_FAIL;
			IAIMPPlaylistQueue *queue = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPPlaylistQueue, reinterpret_cast<void **>(&queue))) && queue)
			{
				hr = queue->Delete(item);
				queue->Release();
			}
			item->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw LocalizedRpcError(ErrorTrackNotFound, "dequeueTrackNotFound");
		if (Failed(result))
			throw LocalizedRpcError(ErrorDequeueFailed, "dequeueFailed");
		return nullptr; });
}
