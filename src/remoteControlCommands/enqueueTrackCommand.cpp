#include "enqueueTrackCommand.h"

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
	constexpr int ErrorEnqueueFailed = 18;
}

void EnqueueTrackCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("EnqueueTrack", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool atBeginning = params.value("insert_at_queue_beginning", false);

		const HRESULT result = RunOnMainThread(core, [&]() -> HRESULT
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return E_INVALIDARG;
			HRESULT hr = E_FAIL;
			IAIMPPlaylistQueue *queue = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPPlaylistQueue, reinterpret_cast<void **>(&queue))) && queue)
			{
				hr = queue->Add(item, atBeginning);
				queue->Release();
			}
			item->Release();
			return hr;
		});
		if (result == E_INVALIDARG)
			throw RpcError(ErrorTrackNotFound, "Enqueue track failed. Reason: track not found.");
		if (Failed(result))
			throw RpcError(ErrorEnqueueFailed, "Enqueue track failed.");
		return nullptr; });
}
