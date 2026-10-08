#pragma once

#include <algorithm>
#include <cctype>
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
	constexpr std::int32_t DefaultPageLimit = 200;
	constexpr std::int32_t MaxPageLimit = 500;

	inline std::string QueryString(const ApiRequest &request, const char *name)
	{
		const auto it = request.Query.find(name);
		return it == request.Query.end() ? std::string() : it->second;
	}

	// Whitespace-only searches mean no search, so that they share the cache key of
	// the plain list on the client.
	inline std::string SearchText(const ApiRequest &request)
	{
		std::string search = QueryString(request, "search");
		const auto notSpace = [](unsigned char c) { return !std::isspace(c); };
		search.erase(search.begin(), std::find_if(search.begin(), search.end(), notSpace));
		search.erase(std::find_if(search.rbegin(), search.rend(), notSpace).base(), search.end());
		return search;
	}

	// The texts a search looks through, by the names of the web API; every named one
	// when `names` is empty. The folder name belongs to the playlist's own search
	// and has no name, so a request that names fields searches as GET /search does.
	inline SearchFields ParseSearchFields(const std::vector<std::string> &names, const char *errorCode)
	{
		if (names.empty())
			return SearchFields{true, true, true, true, false, true};
		SearchFields fields{false, false, false, false, false, false};
		for (const std::string &name : names)
		{
			if (name == "title")
				fields.Title = true;
			else if (name == "artist")
				fields.Artist = true;
			else if (name == "album")
				fields.Album = true;
			else if (name == "genre")
				fields.Genre = true;
			else if (name == "file")
				fields.File = true;
			else
				throw ApiError(400, errorCode);
		}
		return fields;
	}

	// A comma-separated list, without empty entries.
	inline std::vector<std::string> SplitCommaList(std::string_view text)
	{
		std::vector<std::string> values;
		while (!text.empty())
		{
			const std::size_t comma = text.find(',');
			const std::string_view value = text.substr(0, comma);
			if (!value.empty())
				values.emplace_back(value);
			text = comma == std::string_view::npos ? std::string_view() : text.substr(comma + 1);
		}
		return values;
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

	// With `nonEmpty` the array must be there with at least one value; otherwise a
	// missing array is an empty one.
	inline std::vector<std::string> StringArray(const nlohmann::json &body, const char *name, bool nonEmpty)
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
		std::vector<std::string> values;
		for (const nlohmann::json &value : array)
		{
			if (!value.is_string())
				throw ApiError(400, "invalidBody");
			values.push_back(value.get<std::string>());
		}
		return values;
	}

	// `indexes`, or `search` with `except`, `groups` and extra `indexes`; see
	// player::ItemSelection.
	inline player::ItemSelection SelectionBody(const nlohmann::json &body)
	{
		if (!body.is_object())
			throw ApiError(400, "invalidBody");
		player::ItemSelection selection;
		selection.Search = OptionalField<std::string>(body, "search", &nlohmann::json::is_string);
		if (!selection.Search)
		{
			if (body.contains("except") || body.contains("groups") || body.contains("fields"))
				throw ApiError(400, "invalidBody");
			selection.Indexes = IntArray(body, "indexes", true);
			return selection;
		}
		selection.Indexes = IntArray(body, "indexes", false);
		selection.Except = IntArray(body, "except", false);
		if (body.contains("groups"))
			selection.Groups = IntArray(body, "groups", false);
		if (body.contains("fields"))
			selection.Fields = ParseSearchFields(StringArray(body, "fields", true), "invalidBody");
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

	// Zero for a playlist the events have not seen.
	inline std::uint64_t RevisionOf(const StateUpdateEvents::PlaylistRevisions &revisions, const std::string &playlistId)
	{
		const auto revision = revisions.find(playlistId);
		return revision == revisions.end() ? 0 : revision->second;
	}

	inline void CheckRevision(const nlohmann::json &body, StateUpdateEvents &events, const std::string &playlistId)
	{
		CheckRevision(body, events.PlaylistRevision(playlistId), "playlistChanged");
	}
}
