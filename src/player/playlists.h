#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

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
		bool Grouped = false;
		std::string GroupingTemplate;
		bool GroupAutoMerge = false;
		std::optional<std::uint32_t> ContentCrc32;
	};

	std::vector<PlaylistInfo> GetPlaylists(IAIMPCore *core, bool withContentCrc32 = false);

	// The playlist's view, formatting and grouping settings as one comparable string;
	// they change without any notification from the player.
	std::string SettingsSnapshot(IAIMPPlaylist *playlist);
}
