#pragma once

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
}
