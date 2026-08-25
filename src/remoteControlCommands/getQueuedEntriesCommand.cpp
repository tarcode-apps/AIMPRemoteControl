#include "getQueuedEntriesCommand.h"

#include <cstdint>
#include <functional>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "playlistEntryJson.h"
#include "remoteControlIdManager.h"

void GetQueuedEntriesCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetQueuedEntries", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
	{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		return RunOnMainThread(core, [&]() -> nlohmann::json
							   {
			nlohmann::json entries = nlohmann::json::array();
			int count = 0;
			IAIMPServiceFileURI *fileUriService = nullptr;
			core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService));

			IAIMPPlaylistQueue *queue = nullptr;
			if (Succeeded(core->QueryInterface(IID_IAIMPPlaylistQueue, reinterpret_cast<void **>(&queue))) && queue)
			{
				count = queue->GetItemCount();
				for (INT32 i = 0; i < count; ++i)
				{
					IAIMPPlaylistItem *item = nullptr;
					if (Failed(queue->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
						continue;

					IAIMPPlaylist *playlist = nullptr;
					item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist));
					const std::string playlistAIMPId = GetPlaylistAIMPId(playlist);
					if (playlist)
						playlist->Release();

					INT32 itemIndex = 0;
					item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &itemIndex);

					const PlaylistEntryContext ctx(fileUriService, item,
												   idManager.PlaylistItemGetOrGeneratePluginId(playlistAIMPId, itemIndex),
												   idManager.PlaylistGetOrGeneratePluginId(playlistAIMPId), i);

					nlohmann::json row = nlohmann::json::array();
					for (const auto &field : fields)
						row.push_back(PlaylistEntryField(field, ctx));
					entries.push_back(std::move(row));

					item->Release();
				}
				queue->Release();
			}
			if (fileUriService)
				fileUriService->Release();

			return nlohmann::json{
				{"count_of_found_entries", count},
				{"entries", std::move(entries)}}; });
	});
}
