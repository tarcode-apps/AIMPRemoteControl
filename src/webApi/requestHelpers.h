#pragma once

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "apiErrors.h"
#include "player/playlistItems.h"
#include "stateUpdateEvents.h"

namespace webapi
{
	inline void ThrowUnlessOk(player::MutationResult result)
	{
		switch (result)
		{
		case player::MutationResult::Ok:
			return;
		case player::MutationResult::PlaylistNotFound:
			throw ApiError(404, "playlistNotFound");
		case player::MutationResult::PlaylistReadOnly:
			throw ApiError(403, "playlistReadOnly");
		case player::MutationResult::GroupNotFound:
			throw ApiError(404, "groupNotFound");
		case player::MutationResult::ItemNotFound:
			throw ApiError(404, "itemNotFound");
		case player::MutationResult::Failed:
			throw ApiError(500, "playlistUpdateFailed");
		}
	}

	// Indexes and group indexes are only meaningful within one revision, so bodies
	// may carry the revision they were computed against.
	inline void CheckRevision(const nlohmann::json &body, StateUpdateEvents &events, const std::string &playlistId)
	{
		if (!body.contains("revision"))
			return;
		if (!body["revision"].is_number_unsigned())
			throw ApiError(400, "invalidBody");
		if (body["revision"].get<std::uint64_t>() != events.PlaylistRevision(playlistId))
			throw ApiError(409, "playlistChanged");
	}
}
