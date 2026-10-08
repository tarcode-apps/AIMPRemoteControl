#include "search.h"

#include <set>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playlistItemContext.h"

namespace
{
	// The playlists in scope in the player's order, for the caller to release.
	std::optional<std::vector<IAIMPPlaylist *>> ScopePlaylists(IAIMPCore *core, const std::optional<std::vector<std::string>> &playlistIds)
	{
		std::vector<IAIMPPlaylist *> playlists;
		IAIMPServicePlaylistManager *mgr = AcquireService<IAIMPServicePlaylistManager>(core, IID_IAIMPServicePlaylistManager);
		if (!mgr)
			return playlists;
		std::set<std::string> wanted;
		if (playlistIds)
			wanted.insert(playlistIds->begin(), playlistIds->end());
		const INT32 count = mgr->GetLoadedPlaylistCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPPlaylist *playlist = nullptr;
			if (Failed(mgr->GetLoadedPlaylist(i, &playlist)) || !playlist)
				continue;
			if (playlistIds && !wanted.count(GetPlaylistAIMPId(playlist)))
				playlist->Release();
			else
				playlists.push_back(playlist);
		}
		mgr->Release();
		if (playlistIds && playlists.size() != wanted.size())
		{
			for (IAIMPPlaylist *playlist : playlists)
				playlist->Release();
			return std::nullopt;
		}
		return playlists;
	}
}

std::optional<player::SearchResults> player::SearchItems(IAIMPCore *core, const SearchQuery &query)
{
	std::optional<std::vector<IAIMPPlaylist *>> playlists = ScopePlaylists(core, query.PlaylistIds);
	if (!playlists)
		return std::nullopt;

	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	IAIMPString *search = StringToIAIMPString(core, query.Search);
	SearchResults results;

	for (IAIMPPlaylist *playlist : *playlists)
	{
		SearchPlaylist info{GetPlaylistAIMPId(playlist)};
		// Built once per playlist, and only when one of its hits lands on the page.
		std::optional<SecondLineFormatter> secondLine;
		const INT32 count = search ? playlist->GetItemCount() : 0;
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPPlaylistItem *item = nullptr;
			if (Failed(playlist->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
				continue;
			const PlaylistItemContext ctx(fileUriService, item);
			if (PlaylistItemMatches(ctx, search, query.Fields))
			{
				const std::int32_t position = results.Matches.Count;
				if (position >= query.Offset && position - query.Offset < query.Limit)
				{
					if (!secondLine)
						secondLine.emplace(core, playlist, true);
					results.Items.push_back({info.Id, ReadPlaylistItem(ctx, i, *secondLine)});
				}
				AddToSummary(ctx, results.Matches);
				AddToSummary(ctx, info.Matches);
			}
			item->Release();
		}
		if (info.Matches.Count > 0)
			results.Playlists.push_back(std::move(info));
		playlist->Release();
	}

	if (search)
		search->Release();
	if (fileUriService)
		fileUriService->Release();
	return results;
}
