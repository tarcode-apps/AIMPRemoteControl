#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "playlistItems.h"

class IAIMPCore;
class IAIMPPlaylist;

namespace player
{
	struct PlaylistInfo
	{
		std::string Id;
		std::string Name;
		bool ReadOnly = false;
		std::int32_t ItemCount = 0;
		double Duration = 0; // seconds
		std::int64_t Size = 0; // bytes
		bool ShowNumbers = true;
		bool AbsoluteNumbers = false; // numbering continues across groups instead of restarting
		bool ShowDuration = true;
		bool ShowSecondLine = true;
		bool ShowThumbnails = true;
		bool ShowMarks = false;
		bool Grouped = false;
		std::string GroupingTemplate;
		bool GroupAutoMerge = false;
		std::optional<std::uint32_t> ContentCrc32;
	};

	std::vector<PlaylistInfo> GetPlaylists(IAIMPCore *core, bool withContentCrc32 = false);

	// The new playlist's id, empty when the player refused. With an empty name the
	// player names the playlist itself, by its content once it has some.
	std::string CreatePlaylist(IAIMPCore *core, const std::string &name);

	// An empty name hands the naming back to the player.
	MutationResult RenamePlaylist(IAIMPCore *core, const std::string &playlistId, const std::string &name);

	MutationResult RemovePlaylist(IAIMPCore *core, const std::string &playlistId);

	// The playlist's view, formatting and grouping settings as one comparable string;
	// they change without any notification from the player.
	std::string SettingsSnapshot(IAIMPPlaylist *playlist);
}
