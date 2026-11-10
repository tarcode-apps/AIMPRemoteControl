#include "enqueueTrackCommand.h"

#include "apiErrors.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "helpers/legacyErrors.h"
#include "helpers/idLookup.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/queue.h"

void rpcapi::EnqueueTrackCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("EnqueueTrack", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const bool atBeginning = params.value("insert_at_queue_beginning", false);

		const player::MutationResult result = RunOnMainThread(core, [&]
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return player::MutationResult::ItemNotFound;
			const player::MutationResult enqueued = player::EnqueueItem(core, item, atBeginning);
			item->Release();
			return enqueued;
		});
		ThrowUnlessOk(result, {ErrorTrackNotFound, "enqueueTrackNotFound"}, {ErrorEnqueueFailed, "enqueueFailed"});
		return nullptr; });
}
