#pragma once

#include <charconv>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

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

	// A body field that may be left out, but must have the type when present.
	template <typename T>
	std::optional<T> OptionalField(const nlohmann::json &body, const char *name, bool (nlohmann::json::*isType)() const)
	{
		if (!body.contains(name))
			return std::nullopt;
		if (!(body[name].*isType)())
			throw ApiError(400, "invalidBody");
		return body[name].get<T>();
	}

	// With `nonEmpty` the array must be there with at least one value; otherwise a
	// missing array is an empty one.
	inline std::vector<std::int32_t> IntArray(const nlohmann::json &body, const char *name, bool nonEmpty)
	{
		if (!body.contains(name))
		{
			if (nonEmpty)
				throw ApiError(400, "invalidBody");
			return {};
		}
		const nlohmann::json &array = body[name];
		if (!array.is_array() || (nonEmpty && array.empty()))
			throw ApiError(400, "invalidBody");
		std::vector<std::int32_t> values;
		for (const nlohmann::json &value : array)
		{
			if (!value.is_number_integer())
				throw ApiError(400, "invalidBody");
			values.push_back(value.get<std::int32_t>());
		}
		return values;
	}

	// `search` with `except` for everything the search finds, or `indexes`.
	inline player::ItemSelection SelectionBody(const nlohmann::json &body)
	{
		if (!body.is_object())
			throw ApiError(400, "invalidBody");
		player::ItemSelection selection;
		if (body.contains("indexes"))
		{
			selection.Indexes = IntArray(body, "indexes", true);
			return selection;
		}
		selection.Search = OptionalField<std::string>(body, "search", &nlohmann::json::is_string);
		if (!selection.Search)
			throw ApiError(400, "invalidBody");
		selection.Except = IntArray(body, "except", false);
		return selection;
	}

	// The positions (or indexes) to move, named `listName`, and their `target`.
	inline std::pair<std::vector<std::int32_t>, std::int32_t> MoveBody(const nlohmann::json &body, const char *listName)
	{
		if (!body.is_object() || !body.contains("target") || !body["target"].is_number_integer())
			throw ApiError(400, "invalidBody");
		return {IntArray(body, listName, true), body["target"].get<std::int32_t>()};
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

	// Indexes and positions are only meaningful within one revision, so bodies may
	// carry the revision they were computed against.
	inline void CheckRevision(const nlohmann::json &body, std::uint64_t current, const char *changedCode)
	{
		if (!body.contains("revision"))
			return;
		if (!body["revision"].is_number_unsigned())
			throw ApiError(400, "invalidBody");
		if (body["revision"].get<std::uint64_t>() != current)
			throw ApiError(409, changedCode);
	}

	inline void CheckRevision(const nlohmann::json &body, StateUpdateEvents &events, const std::string &playlistId)
	{
		CheckRevision(body, events.PlaylistRevision(playlistId), "playlistChanged");
	}
}
