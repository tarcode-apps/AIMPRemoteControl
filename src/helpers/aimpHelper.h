#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "apiCore.h"
#include "apiObjects.h"
#include "apiPlaylists.h"


std::string IAIMPStringToString(IAIMPString *s);
IAIMPString *StringToIAIMPString(IAIMPCore *core, const std::string &utf8);

std::string GetPropertyAsString(IAIMPPropertyList *props, INT32 propertyId);
std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback);
std::string GetPlaylistAIMPId(IAIMPPlaylist *playlist);
IAIMPPlaylist *LoadedPlaylistByAIMPId(IAIMPCore *core, const std::string &aimpId);

HRESULT AddFilesToPlaylist(IAIMPCore *core, IAIMPPlaylist *playlist, const std::vector<std::string> &fileUris);

std::vector<std::string> SupportedAudioExtensions(IAIMPCore *core);

bool MoveFocus(IAIMPPlaylistItem *item, int delta);
