#pragma once

#include <filesystem>
#include <string>

#include "playlistItems.h"

class IAIMPCore;
class IAIMPPlaylistItem;

namespace player
{
	// The audio file behind a part of a container: for a CUE sheet, the file the
	// sheet names. Empty when the player names none.
	std::string AudioSourceFile(IAIMPCore *core, const std::string &fileUri);

	// The file an item plays from, as the player names it: its own, or for a part
	// of a container the audio file the parts are cut from. Empty for a stream;
	// the file may have gone from disk since, which the caller checks off the
	// main thread.
	std::string TrackFile(IAIMPCore *core, IAIMPPlaylistItem *item);

	// The same for the item of a loaded playlist with this URI.
	MutationResult FindTrackFile(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, std::string &file);

	// The media type of an audio file by its extension.
	std::string AudioContentType(const std::filesystem::path &file);
}
