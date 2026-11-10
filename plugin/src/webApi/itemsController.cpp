#include "itemsController.h"

#include "apiErrors.h"

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "helpers/itemJson.h"
#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/playlistItems.h"
#include "settings.h"
#include "stateUpdateEvents.h"

namespace
{
	using webapi::CheckSelectionRevisions;
	using webapi::EnabledBody;
	using webapi::OptionalField;
	using webapi::RequestSelection;
	using webapi::SelectionBody;
	using webapi::ThrowUnlessOk;
}

void webapi::ItemsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Post, "/api/v1/items/enabled", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const RequestSelection body = SelectionBody(request.Body);
		const bool enabled = EnabledBody(request.Body);
		CheckSelectionRevisions(body, events);
		std::size_t failedPlaylist = 0;
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::SetItemsEnabled(core, body.Items, enabled, failedPlaylist); });
		ThrowUnlessOk(result, body, failedPlaylist);
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/items/details", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const RequestSelection body = SelectionBody(request.Body);
		CheckSelectionRevisions(body, events);
		std::size_t failedPlaylist = 0;
		std::vector<player::ItemDetails> details;
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::DescribeItems(core, body.Items, details, failedPlaylist); });
		ThrowUnlessOk(result, body, failedPlaylist);
		const StateUpdateEvents::PlaylistRevisions revisions = events.CurrentPlaylistRevisions();
		nlohmann::json items = nlohmann::json::array();
		for (const player::ItemDetails &item : details)
			items.push_back(DetailsJson(item, RevisionOf(revisions, item.PlaylistId)));
		return {{"items", std::move(items)}}; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/items/summary", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const RequestSelection body = SelectionBody(request.Body);
		CheckSelectionRevisions(body, events);
		std::size_t failedPlaylist = 0;
		player::ItemsSummary summary;
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::SummarizeItems(core, body.Items, summary, failedPlaylist); });
		ThrowUnlessOk(result, body, failedPlaylist);
		return {{"count", summary.Count}, {"duration", summary.Duration}, {"size", summary.Size}}; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/items/remove", [core = FCore, &events = FEvents, &settings = FSettings](const ApiRequest &request) -> nlohmann::json
			   {
		const RequestSelection body = SelectionBody(request.Body);
		const bool physically = OptionalField<bool>(request.Body, "physically", &nlohmann::json::is_boolean).value_or(false);
		if (physically && !settings.Get().Features.PhysicalDeletion)
			throw ApiError(403, "physicalDeletionDisabled");
		CheckSelectionRevisions(body, events);
		std::size_t failedPlaylist = 0;
		std::vector<std::string> undeletable;
		const player::MutationResult result = RunOnMainThread(core, [&]
															  { return player::RemoveItems(core, body.Items, physically, undeletable, failedPlaylist); });
		if (result == player::MutationResult::FilesNotDeletable)
			throw ApiError(403, "filesNotDeletable", {{"files", undeletable}});
		ThrowUnlessOk(result, body, failedPlaylist);
		return nlohmann::json::object(); });
}
