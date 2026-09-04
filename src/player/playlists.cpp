#include "playlists.h"

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "crc32.h"

namespace
{
	std::uint32_t ContentCrc32(IAIMPPlaylist *playlist)
	{
		IAIMPObjectList *files = nullptr;
		if (Failed(playlist->GetFiles(0, &files)) || !files)
			return 0;

		std::uint32_t crc = 0;
		const INT32 count = files->GetCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPString *name = nullptr;
			if (Succeeded(files->GetObject(i, IID_IAIMPString, reinterpret_cast<void **>(&name))) && name)
			{
				const std::string utf8 = IAIMPStringToString(name);
				if (!utf8.empty())
					crc = Crc32Update(crc, utf8.data(), utf8.size());
				name->Release();
			}
		}
		files->Release();
		return crc;
	}

	std::optional<player::PlaylistInfo> Describe(IAIMPPlaylist *playlist, bool withContentCrc32)
	{
		IAIMPPlaylistProperties *props = nullptr;
		if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
			return std::nullopt;

		player::PlaylistInfo info;
		info.Id = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_ID);
		info.Name = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_NAME);
		INT32 readOnly = 0;
		props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_READONLY, &readOnly);
		info.ReadOnly = readOnly != 0;
		props->Release();

		info.EntryCount = playlist->GetItemCount();
		if (withContentCrc32)
			info.ContentCrc32 = ContentCrc32(playlist);
		return info;
	}
}

std::vector<player::PlaylistInfo> player::GetPlaylists(IAIMPCore *core, bool withContentCrc32)
{
	std::vector<PlaylistInfo> result;

	IAIMPServicePlaylistManager *mgr = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
		return result;

	const INT32 count = mgr->GetLoadedPlaylistCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylist *playlist = nullptr;
		if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
		{
			if (std::optional<PlaylistInfo> info = Describe(playlist, withContentCrc32))
				result.push_back(std::move(*info));
			playlist->Release();
		}
	}
	mgr->Release();
	return result;
}
