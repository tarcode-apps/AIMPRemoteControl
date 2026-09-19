#include "getPlaylistEntriesCommand.h"

#include <cstdint>
#include <limits>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "helpers/idLookup.h"
#include "helpers/playlistEntryJson.h"
#include "helpers/remoteControlIdManager.h"
#include "mainThreadRunner.h"
#include "player/playlistItems.h"

namespace
{
	void CollectEntries(IAIMPCore *core, IAIMPPlaylist *playlist, const std::vector<std::string> &fields,
						const std::string &search, RemoteControlIdManager &idManager, nlohmann::json &entries)
	{
		const std::string playlistAIMPId = GetPlaylistAIMPId(playlist);
		const std::int32_t playlistId = idManager.PlaylistGetOrGeneratePluginId(playlistAIMPId);
		const player::ItemsQuery query{0, std::numeric_limits<std::int32_t>::max(), search};
		player::VisitPlaylistItems(core, playlist, query, [&](const PlaylistItemContext &ctx, std::int32_t index)
								   {
			const PlaylistEntryIds ids{idManager.PlaylistItemGetOrGeneratePluginId(playlistAIMPId, index), playlistId};
			nlohmann::json row = nlohmann::json::array();
			for (const auto &field : fields)
				row.push_back(PlaylistEntryField(field, ctx, ids));
			entries.push_back(std::move(row)); });
	}
}

void rpcapi::GetPlaylistEntriesCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetPlaylistEntries", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
	{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		const std::string search = params.value("search_string", std::string());
		const bool byPlaylist = params.contains("playlist_id") && params["playlist_id"].is_number_integer();
		const std::int32_t playlistId = byPlaylist ? params["playlist_id"].get<std::int32_t>() : 0;

		return RunOnMainThread(core, [&]() -> nlohmann::json
							   {
			nlohmann::json entries = nlohmann::json::array();
			INT32 total = 0;
			if (byPlaylist)
			{
				if (IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId))
				{
					total = playlist->GetItemCount();
					CollectEntries(core, playlist, fields, search, idManager, entries);
					playlist->Release();
				}
			}
			else
			{
				IAIMPServicePlaylistManager *mgr = nullptr;
				if (Succeeded(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) && mgr)
				{
					const INT32 count = mgr->GetLoadedPlaylistCount();
					for (INT32 i = 0; i < count; ++i)
					{
						IAIMPPlaylist *playlist = nullptr;
						if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
						{
							CollectEntries(core, playlist, fields, search, idManager, entries);
							playlist->Release();
						}
					}
					mgr->Release();
				}
			}

			nlohmann::json result{{"count_of_found_entries", entries.size()}, {"entries", std::move(entries)}};
			if (byPlaylist)
				result["total_entries_count"] = total;
			return result; });
	});
}
