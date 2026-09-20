#include "playlistsController.h"

#include "apiErrors.h"

#include <algorithm>
#include <cctype>
#include <charconv>
#include <optional>
#include <utility>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "mainThreadRunner.h"
#include "player/playlistItems.h"
#include "player/playlists.h"
#include "stateUpdateEvents.h"

namespace
{
	constexpr std::int32_t DefaultLimit = 200;
	constexpr std::int32_t MaxLimit = 500;

	std::string QueryString(const ApiRequest &request, const char *name)
	{
		const auto it = request.Query.find(name);
		return it == request.Query.end() ? std::string() : it->second;
	}

	// Whitespace-only searches mean no search, so that they share the cache key of
	// the plain list on the client.
	std::string SearchQuery(const ApiRequest &request)
	{
		std::string search = QueryString(request, "search");
		const auto notSpace = [](unsigned char c) { return !std::isspace(c); };
		search.erase(search.begin(), std::find_if(search.begin(), search.end(), notSpace));
		search.erase(std::find_if(search.rbegin(), search.rend(), notSpace).base(), search.end());
		return search;
	}

	std::int32_t QueryInt(const ApiRequest &request, const char *name, std::int32_t fallback, std::int32_t min, std::int32_t max)
	{
		const std::string text = QueryString(request, name);
		if (text.empty())
			return fallback;
		std::int32_t value = 0;
		const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
		if (error != std::errc() || end != text.data() + text.size() || value < min || value > max)
			throw ApiError(400, "invalidQuery");
		return value;
	}

	nlohmann::json ToJson(const player::PlaylistInfo &playlist, std::uint64_t revision)
	{
		return {
			{"id", playlist.Id},
			{"name", playlist.Name},
			{"readOnly", playlist.ReadOnly},
			{"itemCount", playlist.ItemCount},
			{"duration", playlist.Duration},
			{"size", playlist.Size},
			{"revision", revision},
			{"showNumbers", playlist.ShowNumbers},
			{"absoluteNumbers", playlist.AbsoluteNumbers},
			{"showDuration", playlist.ShowDuration},
			{"showSecondLine", playlist.ShowSecondLine},
			{"grouping", {{"enabled", playlist.Grouped}, {"template", playlist.GroupingTemplate}, {"autoMerge", playlist.GroupAutoMerge}}},
		};
	}

	nlohmann::json ToJson(const player::PlaylistItem &item)
	{
		return {
			{"index", item.Index},
			{"displayText", item.DisplayText},
			{"secondLine", item.SecondLine},
			{"duration", item.Duration},
			{"rating", item.Rating},
			{"enabled", item.Enabled},
			{"isUrl", item.IsUrl},
		};
	}

	nlohmann::json ToJson(const player::PlaylistGroup &group)
	{
		return {
			{"index", group.Index},
			{"name", group.Name},
			{"count", group.Count},
			{"duration", group.Duration},
			{"expanded", group.Expanded},
			{"firstPosition", group.FirstPosition},
		};
	}

	void ThrowUnlessOk(player::MutationResult result)
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
	void CheckRevision(const nlohmann::json &body, StateUpdateEvents &events, const std::string &playlistId)
	{
		if (!body.contains("revision"))
			return;
		if (!body["revision"].is_number_unsigned())
			throw ApiError(400, "invalidBody");
		if (body["revision"].get<std::uint64_t>() != events.PlaylistRevision(playlistId))
			throw ApiError(409, "playlistChanged");
	}

	nlohmann::json ApplyGroupPatch(IAIMPCore *core, StateUpdateEvents &events, const ApiRequest &request,
								   const std::string &playlistId, std::optional<std::int32_t> index)
	{
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("expanded") || !body["expanded"].is_boolean())
			throw ApiError(400, "invalidBody");
		CheckRevision(body, events, playlistId);
		const bool expanded = body["expanded"].get<bool>();
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetGroupExpanded(core, playlistId, index, expanded); }));
		return nlohmann::json::object();
	}

	player::SortOptions SortBody(const nlohmann::json &body)
	{
		using player::SortMode;
		static const std::pair<const char *, SortMode> modes[] = {
			{"title", SortMode::Title},
			{"fileName", SortMode::FileName},
			{"duration", SortMode::Duration},
			{"artist", SortMode::Artist},
			{"inverse", SortMode::Inverse},
			{"random", SortMode::Random},
			{"randomGroups", SortMode::RandomGroups},
			{"randomGroupItems", SortMode::RandomGroupItems},
			{"randomAll", SortMode::RandomAll},
			{"template", SortMode::Template},
		};
		if (!body.is_object() || !body.contains("by") || !body["by"].is_string())
			throw ApiError(400, "invalidBody");
		const std::string by = body["by"].get<std::string>();
		const auto mode = std::find_if(std::begin(modes), std::end(modes), [&](const auto &entry)
									   { return by == entry.first; });
		if (mode == std::end(modes))
			throw ApiError(400, "invalidBody");

		player::SortOptions options;
		options.Mode = mode->second;
		if (body.contains("descending"))
		{
			if (!body["descending"].is_boolean())
				throw ApiError(400, "invalidBody");
			options.Descending = body["descending"].get<bool>();
		}
		if (options.Mode == SortMode::Template)
		{
			if (!body.contains("template") || !body["template"].is_string() || body["template"].get<std::string>().empty())
				throw ApiError(400, "invalidBody");
			options.Template = body["template"].get<std::string>();
		}
		return options;
	}

	std::pair<std::vector<std::int32_t>, std::int32_t> MoveBody(const nlohmann::json &body)
	{
		if (!body.is_object() || !body.contains("indexes") || !body["indexes"].is_array() || body["indexes"].empty() ||
			!body.contains("target") || !body["target"].is_number_integer())
			throw ApiError(400, "invalidBody");
		std::vector<std::int32_t> indexes;
		for (const nlohmann::json &index : body["indexes"])
		{
			if (!index.is_number_integer())
				throw ApiError(400, "invalidBody");
			indexes.push_back(index.get<std::int32_t>());
		}
		return {std::move(indexes), body["target"].get<std::int32_t>()};
	}
}

void webapi::PlaylistsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/playlists", [core = FCore, &events = FEvents](const ApiRequest &) -> nlohmann::json
			   {
		const std::vector<player::PlaylistInfo> playlists = RunOnMainThread(core, [&]
																			 { return player::GetPlaylists(core); });
		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		nlohmann::json result = nlohmann::json::array();
		for (const player::PlaylistInfo &playlist : playlists)
		{
			const auto revision = revisions.find(playlist.Id);
			result.push_back(ToJson(playlist, revision == revisions.end() ? 0 : revision->second));
		}
		return result; });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/items)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		player::ItemsQuery query;
		query.Offset = QueryInt(request, "offset", 0, 0, INT32_MAX);
		query.Limit = QueryInt(request, "limit", DefaultLimit, 1, MaxLimit);
		query.Search = SearchQuery(request);

		// The revision is read before the items so that a change racing with the read
		// makes the page look older, never newer, than it is.
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::optional<player::ItemsPage> page = RunOnMainThread(core, [&]
																	   { return player::GetPlaylistItems(core, playlistId, query); });
		if (!page)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json items = nlohmann::json::array();
		for (const player::PlaylistItem &item : page->Items)
			items.push_back(ToJson(item));
		return {
			{"total", page->Total},
			{"revision", revision},
			{"offset", page->Offset},
			{"items", std::move(items)},
		}; });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/groups)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::string search = SearchQuery(request);
		const std::optional<std::vector<player::PlaylistGroup>> groups = RunOnMainThread(core, [&]
																				   { return player::GetPlaylistGroups(core, playlistId, search); });
		if (!groups)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json result = nlohmann::json::array();
		for (const player::PlaylistGroup &group : *groups)
			result.push_back(ToJson(group));
		return {{"revision", revision}, {"groups", std::move(result)}}; });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/groups)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   { return ApplyGroupPatch(core, events, request, request.PathMatches.at(0), std::nullopt); });

	endpoints.MapApi(HttpMethod::Patch, R"(/api/v1/playlists/([^/]+)/groups/(\d+))", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   { return ApplyGroupPatch(core, events, request, request.PathMatches.at(0), std::stoi(request.PathMatches.at(1))); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/sort)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::SortOptions options = SortBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SortPlaylist(core, playlistId, options); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/move)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const auto move = MoveBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::MovePlaylistItems(core, playlistId, move.first, move.second); }));
		return nlohmann::json::object(); });
}
