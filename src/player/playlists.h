#pragma once

#include <cstdint>
#include <functional>
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
		bool ShowSwitches = false; // the check boxes that take tracks out of playback
		bool Grouped = false;
		std::string GroupingTemplate;
		bool GroupAutoMerge = false;
	};

	std::vector<PlaylistInfo> GetPlaylists(IAIMPCore *core);

	// The file of every item of a loaded playlist, in order, as the player lists them.
	void VisitPlaylistFiles(IAIMPCore *core, const std::string &playlistId, const std::function<void(const std::string &file)> &visit);

	// The new playlist's id, empty when the player refused. With an empty name the
	// player names the playlist itself, by its content once it has some.
	std::string CreatePlaylist(IAIMPCore *core, const std::string &name);

	// An empty name hands the naming back to the player.
	MutationResult RenamePlaylist(IAIMPCore *core, const std::string &playlistId, const std::string &name);

	MutationResult RemovePlaylist(IAIMPCore *core, const std::string &playlistId);

	// The loaded playlist that may be changed, acquired for the caller to release;
	// otherwise why not, with `playlist` left null.
	MutationResult OpenWritablePlaylist(IAIMPCore *core, const std::string &playlistId, IAIMPPlaylist *&playlist);

	enum class Placement
	{
		End,
		Start,
		At, // before the item at an index
		Scatter // each new item at a random index
	};

	// Adds files, folders, playlist files and URLs where asked; the player expands
	// folders and playlist files itself, in the background but for a scatter. The
	// index of `At` is clamped to the playlist.
	MutationResult AddFiles(IAIMPCore *core, const std::string &playlistId, const std::vector<std::string> &uris,
							Placement placement = Placement::End, std::int32_t index = 0);

	// The playlist's view, formatting and grouping settings as one comparable string,
	// for a player that does not notify of their changes.
	std::string SettingsSnapshot(IAIMPPlaylist *playlist);
}
