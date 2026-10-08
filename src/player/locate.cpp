#include "locate.h"

#include <map>
#include <optional>
#include <unordered_set>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playlistItemContext.h"

std::vector<player::LocatedItem> player::LocatePlaylistItems(IAIMPCore *core, const std::vector<LocateRequest> &requests)
{
	std::map<std::string, std::unordered_set<std::string>> wantedByPlaylist;
	for (const LocateRequest &request : requests)
		wantedByPlaylist[request.PlaylistId].insert(request.FileUri);

	std::vector<LocatedItem> located;
	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	for (auto &[playlistId, wanted] : wantedByPlaylist)
	{
		IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
		if (!playlist)
			continue;
		// Built only once a wanted file turns up.
		std::optional<SecondLineFormatter> secondLine;
		const INT32 count = playlist->GetItemCount();
		for (INT32 i = 0; i < count && !wanted.empty(); ++i)
		{
			IAIMPPlaylistItem *item = nullptr;
			if (Failed(playlist->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
				continue;
			// Only the URI is read for every item; the rest only for the matches.
			if (wanted.erase(GetPropertyAsString(item, AIMP_PLAYLISTITEM_PROPID_FILENAME)))
			{
				if (!secondLine)
					secondLine.emplace(core, playlist, true);
				const PlaylistItemContext ctx(fileUriService, item);
				located.push_back({playlistId, ReadPlaylistItem(ctx, i, *secondLine)});
			}
			item->Release();
		}
		playlist->Release();
	}
	if (fileUriService)
		fileUriService->Release();
	return located;
}
