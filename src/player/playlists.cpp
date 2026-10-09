#include "playlists.h"

#include <initializer_list>

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
		props->GetValueAsFloat(AIMP_PLAYLIST_PROPID_DURATION, &info.Duration);
		INT64 size = 0;
		props->GetValueAsInt64(AIMP_PLAYLIST_PROPID_SIZE, &size);
		info.Size = size;
		const auto flag = [props](int propId)
		{
			INT32 value = 1;
			props->GetValueAsInt32(propId, &value);
			return value != 0;
		};
		info.ShowNumbers = flag(AIMP_PLAYLIST_PROPID_VIEW_NUMBERS);
		info.AbsoluteNumbers = flag(AIMP_PLAYLIST_PROPID_VIEW_NUMBERS_ABSOLUTE);
		info.ShowDuration = flag(AIMP_PLAYLIST_PROPID_VIEW_DURATION);
		info.ShowSecondLine = flag(AIMP_PLAYLIST_PROPID_VIEW_SECOND_LINE);
		// The player shows thumbnails only with the second line; until the SDK exposes the
		// setting itself, the second line decides.
		info.ShowThumbnails = info.ShowSecondLine;
		info.Grouped = flag(AIMP_PLAYLIST_PROPID_GROUPPING);
		info.GroupingTemplate = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_GROUPPING_TEMPLATE);
		info.GroupAutoMerge = flag(AIMP_PLAYLIST_PROPID_GROUPPING_AUTOMERGING);
		props->Release();

		info.ItemCount = playlist->GetItemCount();
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

std::string player::CreatePlaylist(IAIMPCore *core, const std::string &name)
{
	IAIMPServicePlaylistManager *mgr = AcquireService<IAIMPServicePlaylistManager>(core, IID_IAIMPServicePlaylistManager);
	if (!mgr)
		return {};

	std::string id;
	IAIMPString *aimpName = name.empty() ? nullptr : StringToIAIMPString(core, name);
	IAIMPPlaylist *playlist = nullptr;
	if (Succeeded(mgr->CreatePlaylist(aimpName, false, &playlist)) && playlist)
	{
		id = GetPlaylistAIMPId(playlist);
		playlist->Release();
	}
	if (aimpName)
		aimpName->Release();
	mgr->Release();
	return id;
}

player::MutationResult player::RenamePlaylist(IAIMPCore *core, const std::string &playlistId, const std::string &name)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;

	HRESULT hr = E_FAIL;
	IAIMPPlaylistProperties *props = nullptr;
	if (Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
	{
		if (IAIMPString *aimpName = StringToIAIMPString(core, name))
		{
			hr = props->SetValueAsObject(AIMP_PLAYLIST_PROPID_NAME, aimpName);
			aimpName->Release();
		}
		props->Release();
	}
	playlist->Release();
	return Succeeded(hr) ? MutationResult::Ok : MutationResult::Failed;
}

player::MutationResult player::RemovePlaylist(IAIMPCore *core, const std::string &playlistId)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;

	const HRESULT hr = playlist->Close(AIMP_PLAYLIST_CLOSE_FLAGS_FORCE_REMOVE);
	playlist->Release();
	return Succeeded(hr) ? MutationResult::Ok : MutationResult::Failed;
}

std::string player::SettingsSnapshot(IAIMPPlaylist *playlist)
{
	IAIMPPlaylistProperties *props = nullptr;
	if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
		return {};

	std::string settings;
	for (const int propId : {AIMP_PLAYLIST_PROPID_VIEW_NUMBERS, AIMP_PLAYLIST_PROPID_VIEW_NUMBERS_ABSOLUTE,
							 AIMP_PLAYLIST_PROPID_VIEW_DURATION, AIMP_PLAYLIST_PROPID_VIEW_SECOND_LINE,
							 AIMP_PLAYLIST_PROPID_GROUPPING, AIMP_PLAYLIST_PROPID_GROUPPING_AUTOMERGING})
	{
		INT32 value = 0;
		props->GetValueAsInt32(propId, &value);
		settings += value ? '1' : '0';
	}
	for (const int propId : {AIMP_PLAYLIST_PROPID_FORMATING_LINE1_TEMPLATE, AIMP_PLAYLIST_PROPID_FORMATING_LINE2_TEMPLATE,
							 AIMP_PLAYLIST_PROPID_GROUPPING_TEMPLATE})
		settings += GetPropertyAsString(props, propId) + '\n';
	props->Release();
	return settings;
}
