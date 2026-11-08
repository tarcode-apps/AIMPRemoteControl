#pragma once

#include <functional>
#include <string>
#include <vector>

#include "playlistItems.h"

class IAIMPCore;
class IAIMPPlaylistItem;

namespace player
{
	enum class LyricsType
	{
		None,
		Unsynced,
		Synced // every line has the moment it is sung
	};

	struct LyricsLine
	{
		double Time = 0; // seconds from the track's start, of synced lyrics only
		std::string Text;
	};

	// What the player's own lyrics window shows for a track: the file's lyrics tag,
	// which the player reads itself, synced when the tag has the times; or else
	// what its lyrics providers find, in the files beside the track or on the
	// internet where the user lets them; or else the comment tag.
	struct Lyrics
	{
		LyricsType Type = LyricsType::None;
		std::vector<LyricsLine> Lines;
	};

	// Finds the item on the main thread, for ReadLyrics to release; null with the
	// reason when there is none.
	using LyricsItemFinder = std::function<MutationResult(IAIMPPlaylistItem *&item)>;

	// From a worker thread, not the main one: the providers answer on the calling
	// thread, which waits for them.
	MutationResult ReadLyrics(IAIMPCore *core, const LyricsItemFinder &findItem, Lyrics &lyrics);
	MutationResult ReadLyrics(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, Lyrics &lyrics);
}
