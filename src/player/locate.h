#pragma once

#include <string>
#include <vector>

#include "playlistItems.h"

class IAIMPCore;

namespace player
{
	// A file a client remembers, and the playlist it is to be found in.
	struct LocateRequest
	{
		std::string FileUri;
		std::string PlaylistId;
	};

	struct LocatedItem
	{
		std::string PlaylistId;
		PlaylistItem Item;
	};

	// The first item of each playlist whose URI equals the file, byte for byte; a
	// file that is not in its playlist, or whose playlist is not loaded, is left out.
	std::vector<LocatedItem> LocatePlaylistItems(IAIMPCore *core, const std::vector<LocateRequest> &requests);
}
