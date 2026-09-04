#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

class IAIMPCore;

namespace player
{
	struct PlaylistInfo
	{
		std::string Id;
		std::string Name;
		bool ReadOnly = false;
		std::int32_t EntryCount = 0;
		std::optional<std::uint32_t> ContentCrc32;
	};

	std::vector<PlaylistInfo> GetPlaylists(IAIMPCore *core, bool withContentCrc32 = false);
}
