#include "getQueuedEntriesCommand.h"

#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "helpers/playlistEntryJson.h"
#include "helpers/remoteControlIdManager.h"
#include "player/queue.h"

void rpcapi::GetQueuedEntriesCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetQueuedEntries", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
	{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		return RunOnMainThread(core, [&]() -> nlohmann::json
							   {
			nlohmann::json entries = nlohmann::json::array();
			player::VisitQueueItems(core, [&](const PlaylistItemContext &ctx, IAIMPPlaylist *playlist, std::int32_t index, std::int32_t position)
									{
				const std::string playlistAIMPId = GetPlaylistAIMPId(playlist);
				const PlaylistEntryIds ids{idManager.PlaylistItemGetOrGeneratePluginId(playlistAIMPId, index),
										   idManager.PlaylistGetOrGeneratePluginId(playlistAIMPId), position};
				nlohmann::json row = nlohmann::json::array();
				for (const auto &field : fields)
					row.push_back(PlaylistEntryField(field, ctx, ids));
				entries.push_back(std::move(row)); });
			return nlohmann::json{
				{"count_of_found_entries", entries.size()},
				{"entries", std::move(entries)}}; });
	});
}
