#pragma once

#include <cstdint>
#include <string>

#include "coverSource.h"
#include "playlistItems.h"

class IAIMPCore;

namespace player
{
	// What the player's own track information window shows: the tags, the
	// stream's parameters and the statistics of one track.
	struct TrackInfo
	{
		std::int32_t Index = 0;
		std::string FileUri;
		std::string FileName; // the name without the folders, as the window's subtitle
		bool IsUrl = false;
		bool InContainer = false;
		CoverSource Cover;
		std::string Title;
		std::string Artist;
		std::string Album;
		std::string AlbumArtist;
		std::string Genre;
		std::string Year;
		std::string TrackNumber;
		std::string Lyricist;
		std::string Lyrics;
		std::string Format;			 // the codec, or the file's extension when the player names none
		std::int32_t SampleRate = 0; // Hz
		std::int32_t Bitrate = 0;	 // kbps
		std::int32_t BitDepth = 0;
		std::int32_t Channels = 0;
		double Duration = 0;	 // seconds
		std::int64_t Size = 0;	 // bytes
		std::int32_t PlayCount = 0;
		double LastPlayed = 0; // a Delphi TDateTime, 0 when never
	};

	// The item whose URI is `fileUri`, byte for byte, with the tags read from the
	// file itself where there is one: the playlist keeps only the fields it shows.
	MutationResult ReadTrackInfo(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, TrackInfo &info);
}
