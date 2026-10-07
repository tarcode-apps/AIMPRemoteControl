#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "apiCore.h"
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
std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback);
std::string GetPlaylistAIMPId(IAIMPPlaylist *playlist);
IAIMPPlaylist *LoadedPlaylistByAIMPId(IAIMPCore *core, const std::string &aimpId);

HRESULT AddFilesToPlaylist(IAIMPCore *core, IAIMPPlaylist *playlist, const std::vector<std::string> &fileUris);

std::vector<std::string> SupportedAudioExtensions(IAIMPCore *core);

bool MoveFocus(IAIMPPlaylistItem *item, int delta);
