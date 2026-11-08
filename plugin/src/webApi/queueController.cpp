#include "queueController.h"

#include "apiErrors.h"

#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "helpers/itemJson.h"
#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/queue.h"
#include "stateUpdateEvents.h"

namespace
{
	using webapi::CheckRevision;
	using webapi::IntArray;
	using webapi::MoveBody;
	using webapi::OptionalField;
	using webapi::SelectionBody;
	using webapi::ThrowUnlessOk;

	void CheckQueueRevision(const nlohmann::json &body, StateUpdateEvents &events)
	{
		CheckRevision(body, events.QueueRevision(), "queueChanged");
	}

	nlohmann::json ToJson(const player::QueueItem &queued)
	{
		nlohmann::json json = webapi::ItemJson(queued.Item);
		json["position"] = queued.Position;
		json["playlistId"] = queued.PlaylistId;
		return json;
	}
}

void webapi::QueueController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/queue", [core = FCore, &events = FEvents](const ApiRequest &) -> nlohmann::json
			   {
		const std::uint64_t revision = events.QueueRevision();
		const player::QueueSnapshot queue = RunOnMainThread(core, [&]
															 { return player::GetQueue(core); });
		nlohmann::json items = nlohmann::json::array();
		for (const player::QueueItem &queued : queue.Items)
			items.push_back(ToJson(queued));
		return {
			{"revision", revision},
			{"suspended", queue.Suspended},
			{"items", std::move(items)},
		}; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/queue/items", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const nlohmann::json &body = request.Body;
		if (!body.is_object() || !body.contains("playlistId") || !body["playlistId"].is_string())
			throw ApiError(400, "invalidBody");
		const std::string playlistId = body["playlistId"].get<std::string>();
		const player::ItemSelection selection = SelectionBody(body);
		const bool atBeginning = OptionalField<bool>(body, "atBeginning", &nlohmann::json::is_boolean).value_or(false);
		CheckRevision(body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::EnqueueItems(core, playlistId, selection, atBeginning); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/queue/remove", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		if (!request.Body.is_object())
			throw ApiError(400, "invalidBody");
		const std::vector<std::int32_t> positions = IntArray(request.Body, "positions", true);
		CheckQueueRevision(request.Body, events);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::RemoveQueueItems(core, positions); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/queue/move", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const auto move = MoveBody(request.Body, "positions");
		CheckQueueRevision(request.Body, events);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::MoveQueueItems(core, move.first, move.second); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Delete, "/api/v1/queue", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		CheckQueueRevision(request.Body, events);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::ClearQueue(core); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Patch, "/api/v1/queue", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		if (!request.Body.is_object())
			throw ApiError(400, "invalidBody");
		const std::optional<bool> suspended = OptionalField<bool>(request.Body, "suspended", &nlohmann::json::is_boolean);
		if (!suspended)
			throw ApiError(400, "invalidBody");
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::SetQueueSuspended(core, *suspended); }));
		return nlohmann::json::object(); });
}
