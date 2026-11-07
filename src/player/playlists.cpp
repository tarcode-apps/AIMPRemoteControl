#include "playlists.h"

#include <initializer_list>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playerFeatures.h"

namespace
{
	std::optional<player::PlaylistInfo> Describe(IAIMPPlaylist *playlist, const player::PlayerFeatures &features)
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
		// An older player has no thumbnail setting; it shows them with the second line.
		info.ShowThumbnails = features.ThumbnailsSetting ? flag(AIMP_PLAYLIST_PROPID_VIEW_THUMBNAILS) : info.ShowSecondLine;
		info.ShowMarks = flag(AIMP_PLAYLIST_PROPID_VIEW_MARKS);
		info.ShowSwitches = flag(AIMP_PLAYLIST_PROPID_VIEW_SWITCHES);
		info.Grouped = flag(AIMP_PLAYLIST_PROPID_GROUPPING);
		info.GroupingTemplate = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_GROUPPING_TEMPLATE);
		info.GroupAutoMerge = flag(AIMP_PLAYLIST_PROPID_GROUPPING_AUTOMERGING);
		props->Release();

		info.ItemCount = playlist->GetItemCount();
		return info;
	}
}

void player::VisitPlaylistFiles(IAIMPCore *core, const std::string &playlistId, const std::function<void(const std::string &file)> &visit)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return;
	IAIMPObjectList *files = nullptr;
	if (Succeeded(playlist->GetFiles(0, &files)) && files)
	{
		const INT32 count = files->GetCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPString *name = nullptr;
			if (Succeeded(files->GetObject(i, IID_IAIMPString, reinterpret_cast<void **>(&name))) && name)
			{
				visit(IAIMPStringToString(name));
				name->Release();
			}
		}
		files->Release();
	}
	playlist->Release();
}

std::vector<player::PlaylistInfo> player::GetPlaylists(IAIMPCore *core)
{
	std::vector<PlaylistInfo> result;

	IAIMPServicePlaylistManager *mgr = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
		return result;

	const PlayerFeatures features = GetPlayerFeatures(core);
	const INT32 count = mgr->GetLoadedPlaylistCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylist *playlist = nullptr;
		if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
		{
			if (std::optional<PlaylistInfo> info = Describe(playlist, features))
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

player::MutationResult player::OpenWritablePlaylist(IAIMPCore *core, const std::string &playlistId, IAIMPPlaylist *&playlist)
{
	playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	INT32 readOnly = 0;
	IAIMPPlaylistProperties *props = nullptr;
	if (Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
	{
		props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_READONLY, &readOnly);
		props->Release();
	}
	if (!readOnly)
		return MutationResult::Ok;
	playlist->Release();
	playlist = nullptr;
	return MutationResult::PlaylistReadOnly;
}

player::MutationResult player::AddFiles(IAIMPCore *core, const std::string &playlistId, const std::vector<std::string> &uris)
{
	IAIMPPlaylist *playlist = nullptr;
	if (const MutationResult opened = OpenWritablePlaylist(core, playlistId, playlist); opened != MutationResult::Ok)
		return opened;
	const HRESULT hr = AddFilesToPlaylist(core, playlist, uris);
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
							 AIMP_PLAYLIST_PROPID_VIEW_MARKS, AIMP_PLAYLIST_PROPID_VIEW_SWITCHES,
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
