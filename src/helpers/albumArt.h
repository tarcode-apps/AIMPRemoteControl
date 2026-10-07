#pragma once

#include <optional>
#include <string>

class IAIMPCore;
class IAIMPFileInfo;

namespace albumArt
{
	struct Cover
	{
		std::string ContentType; // image/jpeg, image/png or image/gif
		std::string Body;
		int Width = 0;
		int Height = 0;
	};

	enum LoadFlag
	{
		Refresh = 1,  // read the file again instead of taking the player's cached copy
		Original = 2, // the image as found, not the copy the player scaled down to its own limit
	};

	// The cover as the player's own window gets it: from the tags, the folder and,
	// when the player is allowed to, the internet, waited for. Callable from any
	// thread. Nullopt without a cover.
	std::optional<Cover> LoadCover(IAIMPCore *core, IAIMPFileInfo *fileInfo, unsigned flags = 0);

	// The cover scaled down to fit `size` on its longer side; the cover itself when
	// it already fits. Nullopt when the image cannot be decoded.
	std::optional<Cover> ScaleCover(IAIMPCore *core, const Cover &cover, int size);

	std::string ContentHash(const Cover &cover);
}
