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
		// A track tells whether the player found its file when it last tried to play it.
		bool DeadState = false;
		// The repeat is one property of three modes, which the player keeps in step with
		// its action at the end of a playlist.
		bool RepeatModeProperty = false;
		// A playlist can shuffle its groups and the items inside them.
		bool GroupShuffle = false;
		// Controls aligned to the same side of their parent line up in the order they were made.
		bool SideAlignmentInOrder = false;
	};

	// AIMP 5.00 or later; an older player is refused.
	bool IsSupportedPlayer(IAIMPCore *core);

	// The player's build does not change while it runs, so this is read once, as the plugin starts.
	PlayerFeatures DetectPlayerFeatures(IAIMPCore *core);

	// As the player shows it, such as "v6.00.3080 Beta 5".
	std::string AIMPVersion(IAIMPCore *core);
}
