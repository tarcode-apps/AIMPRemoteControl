#include "searchController.h"

#include "apiErrors.h"

#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "helpers/itemJson.h"
#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/search.h"
#include "stateUpdateEvents.h"

void webapi::SearchController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/search", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		player::SearchQuery query;
		query.Search = SearchText(request);
		if (query.Search.empty())
			throw ApiError(400, "invalidQuery");
		query.Fields = ParseSearchFields(SplitCommaList(QueryString(request, "fields")), "invalidQuery");
		const std::vector<std::string> playlistIds = SplitCommaList(QueryString(request, "playlists"));
		if (!playlistIds.empty())
			query.PlaylistIds = playlistIds;
		query.Offset = QueryInt(request, "offset", 0, 0, INT32_MAX);
		query.Limit = QueryInt(request, "limit", DefaultPageLimit, 1, MaxPageLimit);

		// Read before the search, so that a change racing with it makes the page look
		// older, never newer, than it is.
		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		const std::optional<player::SearchResults> results = RunOnMainThread(core, [&]
																			  { return player::SearchItems(core, query); });
		if (!results)
			throw ApiError(404, "playlistNotFound");

		nlohmann::json items = nlohmann::json::array();
		for (const player::SearchHit &hit : results->Items)
			items.push_back(ItemJson(hit.Item, hit.PlaylistId, RevisionOf(revisions, hit.PlaylistId)));
		nlohmann::json playlists = nlohmann::json::array();
		for (const player::SearchPlaylist &playlist : results->Playlists)
			playlists.push_back({
				{"id", playlist.Id},
				{"revision", RevisionOf(revisions, playlist.Id)},
				{"count", playlist.Matches.Count},
				{"duration", playlist.Matches.Duration},
				{"size", playlist.Matches.Size},
			});
		return {
			{"total", results->Matches.Count},
			{"duration", results->Matches.Duration},
			{"size", results->Matches.Size},
			{"items", std::move(items)},
			{"playlists", std::move(playlists)},
		}; });
}
