#include "getPlaylistEntriesCommand.h"

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "playlistEntryJson.h"
#include "remoteControlIdManager.h"

namespace
{
	INT32 CollectEntries(IAIMPCore *core, IAIMPServiceFileURI *fileUriService, IAIMPPlaylist *playlist,
						 const std::vector<std::string> &fields, IAIMPString *searchString,
						 RemoteControlIdManager &idManager, nlohmann::json &entries)
	{
		const std::string playlistAIMPId = GetPlaylistAIMPId(playlist);
		const std::int32_t playlistId = idManager.PlaylistGetOrGeneratePluginId(playlistAIMPId);

		const INT32 count = playlist->GetItemCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPPlaylistItem *item = nullptr;
			if (Failed(playlist->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
				continue;

			const PlaylistEntryContext ctx(fileUriService, item,
										   idManager.PlaylistItemGetOrGeneratePluginId(playlistAIMPId, i), playlistId);

			if (!searchString || PlaylistEntryMatches(ctx, searchString))
			{
				nlohmann::json row = nlohmann::json::array();
				for (const auto &field : fields)
					row.push_back(PlaylistEntryField(field, ctx));
				entries.push_back(std::move(row));
			}

			item->Release();
		}
		return count;
	}
}

void GetPlaylistEntriesCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetPlaylistEntries", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
	{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		const std::string search = params.value("search_string", std::string());
		const bool byPlaylist = params.contains("playlist_id") && params["playlist_id"].is_number_integer();
		const std::int32_t playlistId = byPlaylist ? params["playlist_id"].get<std::int32_t>() : 0;

		return RunOnMainThread(core, [&]() -> nlohmann::json
							   {
			nlohmann::json entries = nlohmann::json::array();
			INT32 total = 0;
			IAIMPString *searchString = search.empty() ? nullptr : StringToIAIMPString(core, search);
			IAIMPServiceFileURI *fileUriService = nullptr;
			core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService));

			IAIMPServicePlaylistManager *mgr = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) && mgr)
			{
				if (byPlaylist)
				{
					if (IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId))
					{
						total = CollectEntries(core, fileUriService, playlist, fields, searchString, idManager, entries);
						playlist->Release();
					}
				}
				else
				{
					const INT32 count = mgr->GetLoadedPlaylistCount();
					for (INT32 i = 0; i < count; ++i)
					{
						IAIMPPlaylist *playlist = nullptr;
						if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
						{
							total += CollectEntries(core, fileUriService, playlist, fields, searchString, idManager, entries);
							playlist->Release();
						}
					}
				}
				mgr->Release();
			}
			if (searchString)
				searchString->Release();
			if (fileUriService)
				fileUriService->Release();

			nlohmann::json result{{"count_of_found_entries", entries.size()}, {"entries", std::move(entries)}};
			if (byPlaylist)
				result["total_entries_count"] = total;
			return result; });
	});
}
