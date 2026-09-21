#include "playerController.h"

#include "apiErrors.h"

#include <cmath>
#include <string>

#include "mainThreadRunner.h"
#include "player/playerState.h"
#include "requestHelpers.h"
#include "stateUpdateEvents.h"

namespace
{
	const char *StateName(player::PlaybackState state)
	{
		switch (state)
		{
		case player::PlaybackState::Playing:
			return "playing";
		case player::PlaybackState::Paused:
			return "paused";
		default:
			return "stopped";
		}
	}

	const char *RepeatName(player::RepeatMode mode)
	{
		switch (mode)
		{
		case player::RepeatMode::Playlist:
			return "playlist";
		case player::RepeatMode::Track:
			return "track";
		default:
			return "off";
		}
	}

	player::RepeatMode RepeatNamed(const std::string &name)
	{
		if (name == "off")
			return player::RepeatMode::Off;
		if (name == "playlist")
			return player::RepeatMode::Playlist;
		if (name == "track")
			return player::RepeatMode::Track;
		throw ApiError(400, "invalidBody");
	}

	player::PlayerCommand CommandNamed(const std::string &name)
	{
		if (name == "pause")
			return player::PlayerCommand::Pause;
		if (name == "stop")
			return player::PlayerCommand::Stop;
		if (name == "next")
			return player::PlayerCommand::Next;
		return player::PlayerCommand::Previous;
	}

	void SendCommand(IAIMPCore *core, player::PlayerCommand command)
	{
		if (!RunOnMainThread(core, [&]
							 { return player::SendPlayerCommand(core, command); }))
			throw ApiError(500, "playerCommandFailed");
	}

	template <typename T>
	std::optional<T> OptionalField(const nlohmann::json &body, const char *name, bool (nlohmann::json::*isType)() const)
	{
		if (!body.contains(name))
			return std::nullopt;
		if (!(body[name].*isType)())
			throw ApiError(400, "invalidBody");
		return body[name].get<T>();
	}

	player::PlayerPatch PatchBody(const nlohmann::json &body)
	{
		if (!body.is_object() || body.empty())
			throw ApiError(400, "invalidBody");
		player::PlayerPatch patch;
		patch.Position = OptionalField<double>(body, "position", &nlohmann::json::is_number);
		patch.Volume = OptionalField<float>(body, "volume", &nlohmann::json::is_number);
		patch.Mute = OptionalField<bool>(body, "mute", &nlohmann::json::is_boolean);
		if (const auto repeat = OptionalField<std::string>(body, "repeat", &nlohmann::json::is_string))
			patch.Repeat = RepeatNamed(*repeat);
		patch.Shuffle = OptionalField<bool>(body, "shuffle", &nlohmann::json::is_boolean);
		if ((patch.Position && *patch.Position < 0) || (patch.Volume && (*patch.Volume < 0 || *patch.Volume > 1)))
			throw ApiError(400, "invalidBody");
		return patch;
	}
}

nlohmann::json webapi::PlayerController::Snapshot(IAIMPCore *core, StateUpdateEvents &events)
{
	const player::PlayerState state = RunOnMainThread(core, [&]
													  { return player::GetPlayerState(core); });
	nlohmann::json track = nullptr;
	if (state.Track)
		track = {
			{"playlistId", state.Track->PlaylistId},
			{"playlistRevision", events.PlaylistRevision(state.Track->PlaylistId)},
			{"index", state.Track->Index},
			{"trackNumber", state.Track->TrackNumber},
			{"title", state.Track->Title},
			{"artist", state.Track->Artist},
			{"album", state.Track->Album},
			{"isUrl", state.Track->IsUrl},
		};
	return {
		{"state", StateName(state.State)},
		{"position", state.Position},
		{"duration", state.Duration},
		{"volume", std::round(state.Volume * 1000.0) / 1000.0},
		{"mute", state.Mute},
		{"repeat", RepeatName(state.Repeat)},
		{"shuffle", state.Shuffle},
		{"radioCapture", state.RadioCapture},
		{"track", std::move(track)},
	};
}

void webapi::PlayerController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/player", [core = FCore, &events = FEvents](const ApiRequest &) -> nlohmann::json
			   { return Snapshot(core, events); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/player/play", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const nlohmann::json &body = request.Body;
		if (body.is_null() || (body.is_object() && body.empty()))
		{
			SendCommand(core, player::PlayerCommand::Play);
			return nlohmann::json::object();
		}
		if (!body.is_object() || !body.contains("playlistId") || !body["playlistId"].is_string() ||
			!body.contains("index") || !body["index"].is_number_unsigned())
			throw ApiError(400, "invalidBody");
		const std::string playlistId = body["playlistId"].get<std::string>();
		const std::int32_t index = body["index"].get<std::int32_t>();
		CheckRevision(body, events, playlistId);
		ThrowUnlessOk(RunOnMainThread(core, [&]
									  { return player::PlayPlaylistItem(core, playlistId, index); }));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/player/(pause|stop|next|previous)", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		SendCommand(core, CommandNamed(request.PathMatches.at(0)));
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Patch, "/api/v1/player", [core = FCore](const ApiRequest &request) -> nlohmann::json
			   {
		const player::PlayerPatch patch = PatchBody(request.Body);
		if (!RunOnMainThread(core, [&]
							 { return player::ApplyPlayerPatch(core, patch); }))
			throw ApiError(500, "playerCommandFailed");
		return nlohmann::json::object(); });
}
