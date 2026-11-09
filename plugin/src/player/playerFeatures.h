#pragma once

#include <string>

class IAIMPCore;

namespace player
{
	// What the running player can do; an older one is worked around.
	struct PlayerFeatures
	{
		// The thumbnails setting of a playlist is a property of its own.
		bool ThumbnailsSetting = false;
		// A playlist notifies of its view, formatting and grouping settings changing.
		bool SettingsNotifications = false;
	};

	PlayerFeatures GetPlayerFeatures(IAIMPCore *core);

	// As the player shows it, such as "v6.00.3080 Beta 5".
	std::string AIMPVersion(IAIMPCore *core);
}
