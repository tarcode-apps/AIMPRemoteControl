#pragma once

#include <cstdint>
#include <string>

namespace player
{
	// What a cover is looked up by: the file, and for a stream the track the station
	// is playing, whose cover is the player's rather than the item's.
	struct CoverSource
	{
		std::string FileName;
		std::int64_t FileSize = 0;
		bool IsUrl = false;
		std::string Artist; // streams only
		std::string Album;	// streams only
	};
}
