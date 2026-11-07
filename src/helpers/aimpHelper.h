#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiObjects.h"
#include "apiPlaylists.h"


// A service of the core, null when it has none; released by the caller.
template <typename T>
T *AcquireService(IAIMPCore *core, const GUID &iid)
{
	T *service = nullptr;
	if (Failed(core->QueryInterface(iid, reinterpret_cast<void **>(&service))) || !service)
		return nullptr;
	return service;
}

std::string IAIMPStringToString(IAIMPString *s);
IAIMPString *StringToIAIMPString(IAIMPCore *core, const std::string &utf8);

std::string GetPropertyAsString(IAIMPPropertyList *props, INT32 propertyId);
// The tags of a file read anew, rather than the copy a playlist holds; null when
// the file cannot be read. Released by the caller.
IAIMPFileInfo *ReadFileInfo(IAIMPCore *core, const std::string &fileUri);
std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback);
std::string GetPlaylistAIMPId(IAIMPPlaylist *playlist);
IAIMPPlaylist *LoadedPlaylistByAIMPId(IAIMPCore *core, const std::string &aimpId);

// `flags` are AIMP_PLAYLIST_ADD_FLAGS_*; `insertIn` -1 appends.
HRESULT AddFilesToPlaylist(IAIMPCore *core, IAIMPPlaylist *playlist, const std::vector<std::string> &fileUris, DWORD flags = 0, INT32 insertIn = -1);

bool MoveFocus(IAIMPPlaylistItem *item, int delta);
