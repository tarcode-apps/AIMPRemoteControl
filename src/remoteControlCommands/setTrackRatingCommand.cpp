#include "setTrackRatingCommand.h"

#include <cstdint>
#include <optional>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;
}

void SetTrackRatingCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("SetTrackRating", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		if (!params.contains("rating") || !params["rating"].is_number())
			throw RpcError(-32602, "rating is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();
		const double rating = std::clamp(params["rating"].get<double>(), 0.0, 5.0);

		const std::optional<double> result = RunOnMainThread(core, [&]() -> std::optional<double>
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return std::nullopt;
			item->SetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, rating);
			DOUBLE actual = 0.0;
			item->GetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, &actual);
			item->Release();
			return actual;
		});
		if (!result)
			throw LocalizedRpcError(ErrorTrackNotFound, "setRatingTrackNotFound");
		return {{"rating", *result}}; });
}
