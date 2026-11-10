#pragma once

#include <algorithm>
#include <cctype>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiErrors.h"
#include "parseInt32.h"
#include "player/playlistItemContext.h"
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
	inline player::SearchFields ParseSearchFields(const std::vector<std::string> &names, const char *errorCode)
	{
		if (names.empty())
			return player::SearchFields{true, true, true, true, false, true};
		player::SearchFields fields{false, false, false, false, false, false};
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

	// A `\d+` capture of the route as a number; one too long for the type names nothing.
	inline std::int32_t PathNumber(const ApiRequest &request, std::size_t match, const char *notFoundCode)
	{
		const std::optional<std::int32_t> value = ParseInt32(request.PathMatches.at(match));
		if (!value)
			throw ApiError(404, notFoundCode);
		return *value;
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

	inline bool EnabledBody(const nlohmann::json &body)
	{
		if (!body.is_object() || !body.contains("enabled") || !body["enabled"].is_boolean())
			throw ApiError(400, "invalidBody");
		return body["enabled"].get<bool>();
	}

	// A non-empty array of `[from, to]` pairs of positions, each in order.
	inline std::vector<std::pair<std::int32_t, std::int32_t>> RangeArray(const nlohmann::json &body, const char *name)
	{
		if (!body.contains(name))
			throw ApiError(400, "invalidBody");
		const nlohmann::json &array = body[name];
		if (!array.is_array() || array.empty())
			throw ApiError(400, "invalidBody");
		std::vector<std::pair<std::int32_t, std::int32_t>> ranges;
		for (const nlohmann::json &range : array)
		{
			if (!range.is_array() || range.size() != 2 || !range[0].is_number_integer() || !range[1].is_number_integer())
				throw ApiError(400, "invalidBody");
			const auto from = range[0].get<std::int32_t>();
			const auto to = range[1].get<std::int32_t>();
			if (from < 0 || to < from)
				throw ApiError(400, "invalidBody");
			ranges.emplace_back(from, to);
		}
		return ranges;
	}

	// A selection as a request names it, with the revision of each of its playlists
	// it was made against, where the client says.
	struct RequestSelection
	{
		player::ItemsSelection Items;
		std::vector<std::optional<std::uint64_t>> Revisions; // one for each of Items.Playlists
	};

	// See player::ItemsSelection; with a search only ranges, as its list is what
	// they count.
	inline RequestSelection SelectionBody(const nlohmann::json &body)
	{
		if (!body.is_object() || !body.contains("playlists"))
			throw ApiError(400, "invalidBody");
		const nlohmann::json &playlists = body["playlists"];
		if (!playlists.is_array() || playlists.empty())
			throw ApiError(400, "invalidBody");
		RequestSelection request;
		player::ItemsSelection &selection = request.Items;
		const std::optional<std::string> search = OptionalField<std::string>(body, "search", &nlohmann::json::is_string);
		if (search)
			selection.Search = *search;
		else if (body.contains("fields"))
			throw ApiError(400, "invalidBody");
		if (body.contains("fields"))
			selection.Fields = ParseSearchFields(StringArray(body, "fields", true), "invalidBody");
		for (const nlohmann::json &json : playlists)
		{
			if (!json.is_object() || !json.contains("playlistId") || !json["playlistId"].is_string())
				throw ApiError(400, "invalidBody");
			player::PlaylistSelection entry;
			entry.PlaylistId = json["playlistId"].get<std::string>();
			if (json.contains("ranges") == json.contains("indexes") || (search && json.contains("indexes")))
				throw ApiError(400, "invalidBody");
			if (json.contains("ranges"))
				entry.Ranges = RangeArray(json, "ranges");
			else
				entry.Indexes = IntArray(json, "indexes", true);
			selection.Playlists.push_back(std::move(entry));
			request.Revisions.push_back(OptionalField<std::uint64_t>(json, "revision", &nlohmann::json::is_number_unsigned));
		}
		return request;
	}

	// The positions (or indexes) to move, named `listName`, and their `target`.
	inline std::pair<std::vector<std::int32_t>, std::int32_t> MoveBody(const nlohmann::json &body, const char *listName)
	{
		if (!body.is_object() || !body.contains("target") || !body["target"].is_number_integer())
			throw ApiError(400, "invalidBody");
		return {IntArray(body, listName, true), body["target"].get<std::int32_t>()};
	}

	inline void ThrowUnlessOk(player::MutationResult result, nlohmann::json details = nlohmann::json::object())
	{
		switch (result)
		{
		case player::MutationResult::Ok:
			return;
		case player::MutationResult::PlaylistNotFound:
			throw ApiError(404, "playlistNotFound", std::move(details));
		case player::MutationResult::PlaylistReadOnly:
			throw ApiError(403, "playlistReadOnly", std::move(details));
		case player::MutationResult::GroupNotFound:
			throw ApiError(404, "groupNotFound", std::move(details));
		case player::MutationResult::ItemNotFound:
			throw ApiError(404, "itemNotFound", std::move(details));
		case player::MutationResult::ItemInContainer:
			throw ApiError(400, "itemInContainer", std::move(details));
		case player::MutationResult::FilesNotDeletable:
			throw ApiError(403, "filesNotDeletable", std::move(details));
		case player::MutationResult::Failed:
			throw ApiError(500, "playlistUpdateFailed", std::move(details));
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

	// The error names the playlist that failed, by its place in the selection.
	inline void ThrowUnlessOk(player::MutationResult result, const RequestSelection &request, std::size_t failedPlaylist)
	{
		if (result == player::MutationResult::Ok)
			return;
		const std::vector<player::PlaylistSelection> &playlists = request.Items.Playlists;
		nlohmann::json details = nlohmann::json::object();
		if (failedPlaylist < playlists.size())
			details["playlistId"] = playlists[failedPlaylist].PlaylistId;
		ThrowUnlessOk(result, std::move(details));
	}

	// The error names the playlist whose revision has moved on.
	inline void CheckSelectionRevisions(const RequestSelection &request, StateUpdateEvents &events)
	{
		for (std::size_t i = 0; i < request.Revisions.size(); ++i)
		{
			const std::string &playlistId = request.Items.Playlists[i].PlaylistId;
			if (request.Revisions[i] && *request.Revisions[i] != events.PlaylistRevision(playlistId))
				throw ApiError(409, "playlistChanged", {{"playlistId", playlistId}});
		}
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
