#include "lyricsCommand.h"

#include "apiErrors.h"

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "helpers/legacyErrors.h"
#include "helpers/idLookup.h"
#include "helpers/remoteControlIdManager.h"
#include "player/lyrics.h"

void rpcapi::LyricsCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("Lyrics", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		player::Lyrics lyrics;
		const player::MutationResult found = player::ReadLyrics(core, [&](IAIMPPlaylistItem *&item)
		{
			item = FindPlaylistItem(core, idManager, trackId);
			return item ? player::MutationResult::Ok : player::MutationResult::ItemNotFound;
		}, lyrics);
		if (found != player::MutationResult::Ok)
			throw LocalizedRpcError(ErrorTrackNotFound, "lyricsTrackNotFound");
		if (lyrics.Type == player::LyricsType::None)
			throw LocalizedRpcError(ErrorLyricsNotAvailable, "lyricsNotAvailable");

		// The app shows plain text: synced lines lose their times.
		std::string text;
		for (const player::LyricsLine &line : lyrics.Lines)
		{
			if (!text.empty())
				text += "\r\n";
			text += line.Text;
		}
		return {{"text", text}}; });
}
