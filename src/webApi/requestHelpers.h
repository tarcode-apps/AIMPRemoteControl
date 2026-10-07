#pragma once

#include <charconv>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

#include <nlohmann/json.hpp>

#include "apiErrors.h"
#include "player/playlistItems.h"
#include "stateUpdateEvents.h"

namespace webapi
{
	inline std::string QueryString(const ApiRequest &request, const char *name)
	{
		const auto it = request.Query.find(name);
		return it == request.Query.end() ? std::string() : it->second;
	}

	// The whole text as a number, or nothing.
	inline std::optional<std::int32_t> ParseInt32(std::string_view text)
	{
		std::int32_t value = 0;
		const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
		if (error != std::errc() || end != text.data() + text.size())
			return std::nullopt;
		return value;
	}

	inline std::int32_t QueryInt(const ApiRequest &request, const char *name, std::int32_t fallback, std::int32_t min, std::int32_t max)
	{
		const std::string text = QueryString(request, name);
		if (text.empty())
			return fallback;
		const std::optional<std::int32_t> value = ParseInt32(text);
		if (!value || *value < min || *value > max)
			throw ApiError(400, "invalidQuery");
		return *value;
	}

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
