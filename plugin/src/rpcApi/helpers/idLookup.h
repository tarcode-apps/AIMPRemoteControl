#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "apiCore.h"
#include "apiPlaylists.h"

class RemoteControlIdManager;

// Resolve the protocol's CRC ids to AIMP objects. Caller releases the results.
IAIMPPlaylist *FindPlaylist(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t playlistId);
IAIMPPlaylistItem *FindPlaylistItem(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId,
									IAIMPPlaylist **playlist = nullptr);

// E_INVALIDARG when the playlist is unknown, otherwise the result of AddFilesToPlaylist.
HRESULT AddFilesByPlaylistId(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t playlistId,
							 const std::vector<std::string> &fileUris);
