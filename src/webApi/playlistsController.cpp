#include "playlistsController.h"

#include "apiErrors.h"

#include <algorithm>
#include <cctype>
#include <optional>
#include <utility>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "helpers/itemJson.h"
#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/locate.h"
#include "player/playlistItems.h"
#include "player/playlists.h"
#include "stateUpdateEvents.h"

namespace
{
	using webapi::CheckRevision;
	using webapi::DefaultPageLimit;
	using webapi::MaxPageLimit;
	using webapi::MoveBody;
	using webapi::OptionalField;
	using webapi::QueryInt;
	using webapi::RevisionOf;
	using webapi::SearchText;
	using webapi::SelectionBody;
	using webapi::ThrowUnlessOk;

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
			{"showThumbnails", playlist.ShowThumbnails},
			{"grouping", {{"enabled", playlist.Grouped}, {"template", playlist.GroupingTemplate}, {"autoMerge", playlist.GroupAutoMerge}}},
		};
	}

	nlohmann::json ToJson(const player::PlaylistGroup &group)
	{
		return {
			{"index", group.Index},
			{"name", group.Name},
			{"count", group.Count},
			{"duration", group.Duration},
			{"size", group.Size},
			{"expanded", group.Expanded},
			{"firstPosition", group.FirstPosition},
		};
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
		options.Descending = OptionalField<bool>(body, "descending", &nlohmann::json::is_boolean).value_or(false);
		if (options.Mode == SortMode::Template)
		{
			if (!body.contains("template") || !body["template"].is_string() || body["template"].get<std::string>().empty())
				throw ApiError(400, "invalidBody");
			options.Template = body["template"].get<std::string>();
		}
		return options;
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
			result.push_back(ToJson(playlist, RevisionOf(revisions, playlist.Id)));
		return result; });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/items)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		player::ItemsQuery query;
		query.Offset = QueryInt(request, "offset", 0, 0, INT32_MAX);
		query.Limit = QueryInt(request, "limit", DefaultPageLimit, 1, MaxPageLimit);
		query.Search = SearchText(request);

		// The revision is read before the items so that a change racing with the read
		// makes the page look older, never newer, than it is.
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::optional<player::ItemsPage> page = RunOnMainThread(core, [&]
																	   { return player::GetPlaylistItems(core, playlistId, query); });
		if (!page)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json items = nlohmann::json::array();
		for (const player::PlaylistItem &item : page->Items)
			items.push_back(ItemJson(item));
		nlohmann::json result = {
			{"total", page->Total},
			{"revision", revision},
			{"offset", page->Offset},
			{"items", std::move(items)},
		};
		if (page->Matches)
		{
			result["duration"] = page->Matches->Duration;
			result["size"] = page->Matches->Size;
		}
		return result; });

	endpoints.MapApi(HttpMethod::Post, R"(/api/v1/playlists/([^/]+)/items/details)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const player::ItemSelection selection = SelectionBody(request.Body);
		CheckRevision(request.Body, events, playlistId);
		std::vector<player::ItemDetails> details;
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::DescribePlaylistItems(core, playlistId, selection, details); }));
		nlohmann::json items = nlohmann::json::array();
		for (const player::ItemDetails &item : details)
			items.push_back(DetailsJson(item));
		return {{"items", std::move(items)}}; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/playlists/locate", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("items") || !body["items"].is_array())
			throw ApiError(400, "invalidBody");
		std::vector<player::LocateRequest> requests;
		for (const nlohmann::json &entry : body["items"])
		{
			if (!entry.is_object())
				throw ApiError(400, "invalidBody");
			const auto fileUri = OptionalField<std::string>(entry, "fileUri", &nlohmann::json::is_string);
			const auto playlistId = OptionalField<std::string>(entry, "playlistId", &nlohmann::json::is_string);
			if (!fileUri || !playlistId)
				throw ApiError(400, "invalidBody");
			requests.push_back({*fileUri, *playlistId});
		}

		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		const std::vector<player::LocatedItem> located = RunOnMainThread(core, [&]
																		  { return player::LocatePlaylistItems(core, requests); });
		nlohmann::json found = nlohmann::json::array();
		for (const player::LocatedItem &entry : located)
			found.push_back(ItemJson(entry.Item, entry.PlaylistId, RevisionOf(revisions, entry.PlaylistId)));
		return {{"found", std::move(found)}}; });

	endpoints.MapApi(HttpMethod::Get, R"(/api/v1/playlists/([^/]+)/groups)", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string playlistId = request.PathMatches.at(0);
		const std::uint64_t revision = events.PlaylistRevision(playlistId);
		const std::string search = SearchText(request);
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
		const auto move = MoveBody(request.Body, "indexes");
		CheckRevision(request.Body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::MovePlaylistItems(core, playlistId, move.first, move.second); }));
		return nlohmann::json::object(); });
}
