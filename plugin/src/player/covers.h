#pragma once

#include <cstdint>
#include <string>

#include "coverSource.h"
#include "playlistItems.h"

class IAIMPCore;
class IAIMPFileInfo;

namespace player
{
	CoverSource DescribeCoverSource(IAIMPFileInfo *info, bool isUrl);

	// Names the file in cover URLs; the same across runs of the plugin.
	std::string CoverKey(const CoverSource &source);

	struct CoverTarget
	{
		CoverSource Source;
		IAIMPFileInfo *FileInfo = nullptr; // released by the caller
	};

	// The item's own file info, or the player's for the stream it is playing.
	MutationResult GetCoverTarget(IAIMPCore *core, const std::string &playlistId, std::int32_t index, CoverTarget &target);

	// A file info to look the cover up by again: the player's own while it plays
	// that file, otherwise the file's tags read anew, or for a stream what the source
	// recorded. Released by the caller.
	IAIMPFileInfo *ResolveCoverFileInfo(IAIMPCore *core, const CoverSource &source);
}
