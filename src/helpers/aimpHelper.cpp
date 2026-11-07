#include "aimpHelper.h"

#include <cctype>

#include "apiFileManager.h"
#include "apiMUI.h"

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

IAIMPFileInfo *ReadFileInfo(IAIMPCore *core, const std::string &fileUri)
{
	IAIMPServiceFileInfo *service = AcquireService<IAIMPServiceFileInfo>(core, IID_IAIMPServiceFileInfo);
	IAIMPString *uri = StringToIAIMPString(core, fileUri);
	IAIMPFileInfo *info = nullptr;
	if (service && uri && Succeeded(core->CreateObject(IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))) && info &&
		Failed(service->GetFileInfoFromFileURI(uri, 0, info)))
	{
		info->Release();
		info = nullptr;
	}
	if (uri)
		uri->Release();
	if (service)
		service->Release();
	return info;
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

HRESULT AddFilesToPlaylist(IAIMPCore *core, IAIMPPlaylist *playlist, const std::vector<std::string> &fileUris, DWORD flags, INT32 insertIn)
{
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
		hr = playlist->AddList(list, flags, insertIn);
		list->Release();
	}
	return hr;
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
