#include "idLookup.h"

#include "aimpHelper.h"
#include "remoteControlIdManager.h"

IAIMPPlaylist *FindPlaylist(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t playlistId)
{
	return LoadedPlaylistByAIMPId(core, idManager.PlaylistGetKey(playlistId));
}

IAIMPPlaylistItem *FindPlaylistItem(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId,
									IAIMPPlaylist **playlist)
{
	if (playlist)
		*playlist = nullptr;

	const PlaylistItemKey key = idManager.PlaylistItemGetKey(trackId);
	IAIMPPlaylist *owner = LoadedPlaylistByAIMPId(core, key.AIMPPlaylistId);
	if (!owner)
		return nullptr;

	IAIMPPlaylistItem *item = nullptr;
	if (key.Index < 0 || key.Index >= owner->GetItemCount() ||
		Failed(owner->GetItem(key.Index, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))))
		item = nullptr;

	if (item && playlist)
		*playlist = owner;
	else
		owner->Release();
	return item;
}

HRESULT AddFilesByPlaylistId(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t playlistId,
							 const std::vector<std::string> &fileUris)
{
	IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId);
	if (!playlist)
		return E_INVALIDARG;
	const HRESULT hr = AddFilesToPlaylist(core, playlist, fileUris);
	playlist->Release();
	return hr;
}
