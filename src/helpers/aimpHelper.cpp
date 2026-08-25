#include "aimpHelper.h"

#include <cctype>

#include "apiFileManager.h"
#include "apiMUI.h"
#include "remoteControlIdManager.h"

#ifdef _WIN32
#include <windows.h>
#endif

std::string GetPropertyAsString(IAIMPPropertyList *props, INT32 propertyId)
{
	if (!props)
		return {};
	IAIMPString *s = nullptr;
	if (Failed(props->GetValueAsObject(propertyId, IID_IAIMPString, reinterpret_cast<void **>(&s))) || !s)
		return {};
	std::string result = IAIMPStringToString(s);
	s->Release();
	return result;
}

std::string IAIMPStringToString(IAIMPString *s)
{
	if (!s)
		return {};
	const auto *data = s->GetData();
	const int length = s->GetLength();
	if (length <= 0)
		return {};

#ifdef _WIN32
	const int needed = ::WideCharToMultiByte(CP_UTF8, 0, data, length, nullptr, 0, nullptr, nullptr);
	std::string result(static_cast<size_t>(needed), '\0');
	::WideCharToMultiByte(CP_UTF8, 0, data, length, result.data(), needed, nullptr, nullptr);
	return result;
#else
	return std::string(data, data + length);
#endif
}

IAIMPString *StringToIAIMPString(IAIMPCore *core, const std::string &utf8)
{
	if (!core)
		return nullptr;
	IAIMPString *s = nullptr;
	if (Failed(core->CreateObject(IID_IAIMPString, reinterpret_cast<void **>(&s))) || !s)
		return nullptr;

#ifdef _WIN32
	const int needed = ::MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
	std::wstring wide(static_cast<size_t>(needed), L'\0');
	::MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), wide.data(), needed);
	s->SetData(const_cast<wchar_t *>(wide.c_str()), needed);
#else
	s->SetData(const_cast<char *>(utf8.c_str()), static_cast<int>(utf8.size()));
#endif
	return s;
}

std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback)
{
	IAIMPServiceMUI *mui = nullptr;
	if (!core || Failed(core->QueryInterface(IID_IAIMPServiceMUI, reinterpret_cast<void **>(&mui))))
		return fallback;

	std::string result = fallback;
	if (IAIMPString *key = StringToIAIMPString(core, keyPath))
	{
		IAIMPString *value = nullptr;
		if (Succeeded(mui->GetValue(key, &value)) && value)
		{
			result = IAIMPStringToString(value);
			value->Release();
		}
		key->Release();
	}
	mui->Release();
	return result;
}

std::string GetPlaylistAIMPId(IAIMPPlaylist *playlist)
{
	if (!playlist)
		return {};
	IAIMPPlaylistProperties *props = nullptr;
	if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
		return {};
	std::string aimpId = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_ID);
	props->Release();
	return aimpId;
}

namespace
{
	IAIMPPlaylist *LoadedPlaylistByAIMPId(IAIMPCore *core, const std::string &aimpId)
	{
		if (aimpId.empty())
			return nullptr;

		IAIMPServicePlaylistManager *mgr = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
			return nullptr;

		IAIMPPlaylist *playlist = nullptr;
		if (IAIMPString *key = StringToIAIMPString(core, aimpId))
		{
			if (Failed(mgr->GetLoadedPlaylistByID(key, &playlist)))
				playlist = nullptr;
			key->Release();
		}
		mgr->Release();
		return playlist;
	}
}

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

HRESULT AddFilesToPlaylist(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t playlistId,
						   const std::vector<std::string> &fileUris)
{
	IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId);
	if (!playlist)
		return E_INVALIDARG;

	HRESULT hr = E_FAIL;
	IAIMPObjectList *list = nullptr;
	if (Succeeded(core->CreateObject(IID_IAIMPObjectList, reinterpret_cast<void **>(&list))) && list)
	{
		for (const std::string &uri : fileUris)
		{
			if (IAIMPString *s = StringToIAIMPString(core, uri))
			{
				list->Add(s);
				s->Release();
			}
		}
		hr = playlist->AddList(list, 0, -1); // -1: append
		list->Release();
	}
	playlist->Release();
	return hr;
}

std::vector<std::string> SupportedAudioExtensions(IAIMPCore *core)
{
	std::string masks;
	IAIMPServiceFileFormats *service = nullptr;
	if (Succeeded(core->QueryInterface(IID_IAIMPServiceFileFormats, reinterpret_cast<void **>(&service))) && service)
	{
		IAIMPString *s = nullptr;
		if (Succeeded(service->GetFormats(AIMP_SERVICE_FILEFORMATS_CATEGORY_AUDIO, &s)) && s)
		{
			masks = IAIMPStringToString(s);
			s->Release();
		}
		service->Release();
	}

	std::vector<std::string> extensions;
	std::size_t start = 0;
	while (start < masks.size())
	{
		std::size_t end = masks.find(';', start);
		if (end == std::string::npos)
			end = masks.size();
		std::string mask = masks.substr(start, end - start);
		if (mask.rfind("*.", 0) == 0)
			mask.erase(0, 2);
		for (char &c : mask)
			c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
		if (!mask.empty())
			extensions.push_back(mask);
		start = end + 1;
	}
	return extensions;
}

bool MoveFocus(IAIMPPlaylistItem *item, int delta)
{
	IAIMPPlaylist *playlist = nullptr;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist))) || !playlist)
		return false;
	INT32 index = 0;
	item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
	const INT32 count = playlist->GetItemCount();

	bool moved = false;
	IAIMPPlaylistProperties *props = nullptr;
	if (count > 0 && Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
	{
		const INT32 target = ((index + delta) % count + count) % count;
		moved = Succeeded(props->SetValueAsInt32(AIMP_PLAYLIST_PROPID_FOCUSINDEX, target));
		props->Release();
	}
	playlist->Release();
	return moved;
}
