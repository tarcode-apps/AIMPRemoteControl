#include "lyrics.h"

#include <string_view>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiLyrics.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "playlistItemContext.h"
#include "playlists.h"
#include "trackFile.h"

namespace
{
	struct Track
	{
		player::MutationResult Result = player::MutationResult::Ok;
		IAIMPFileInfo *FileInfo = nullptr; // the item's, which the providers take
		std::string TagText;
		std::string Comment;
	};

	// The item's file info and the lyrics and comment of its tag, read from the
	// file itself when the playlist's copy has none.
	Track FindTrack(IAIMPCore *core, const player::LyricsItemFinder &findItem)
	{
		Track track;
		IAIMPPlaylistItem *item = nullptr;
		track.Result = findItem(item);
		if (!item)
			return track;
		IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
		{
			const player::PlaylistItemContext ctx(fileUriService, item);
			if (ctx.FileInfo)
			{
				ctx.FileInfo->AddRef();
				track.FileInfo = ctx.FileInfo;
				track.TagText = GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_LYRICS);
				track.Comment = GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_COMMENT);
			}
			if ((track.TagText.empty() || track.Comment.empty()) && ctx.FileUri && !player::ItemIsUrl(ctx))
			{
				if (IAIMPFileInfo *file = player::ReadFileInfo(core, IAIMPStringToString(ctx.FileUri)))
				{
					if (track.TagText.empty())
						track.TagText = GetPropertyAsString(file, AIMP_FILEINFO_PROPID_LYRICS);
					if (track.Comment.empty())
						track.Comment = GetPropertyAsString(file, AIMP_FILEINFO_PROPID_COMMENT);
					file->Release();
				}
			}
		}
		if (fileUriService)
			fileUriService->Release();
		item->Release();
		return track;
	}

	void CollectLines(IAIMPLyrics *source, player::Lyrics &lyrics)
	{
		INT32 type = AIMP_LYRICS_TYPE_UNKNOWN;
		source->GetValueAsInt32(AIMP_LYRICS_PROPID_TYPE, &type);
		INT32 count = 0;
		source->GetCount(&count);
		for (INT32 i = 0; i < count; ++i)
		{
			INT32 start = 0, finish = 0;
			IAIMPString *text = nullptr;
			if (Failed(source->Get(i, &start, &finish, &text)))
				continue;
			lyrics.Lines.push_back({start / 1000.0, text ? ToStringAndRelease(text) : std::string()});
		}
		if (!lyrics.Lines.empty())
			lyrics.Type = type == AIMP_LYRICS_TYPE_SYNCED ? player::LyricsType::Synced : player::LyricsType::Unsynced;
	}

	void WINAPI OnLyricsReceived(IAIMPLyrics *received, void *userData)
	{
		if (received)
			CollectLines(received, *static_cast<player::Lyrics *>(userData));
	}

	// The tag's text as lines, without the empty ones at its end.
	void LinesOfText(std::string_view text, player::Lyrics &lyrics)
	{
		while (!text.empty())
		{
			const std::size_t end = text.find('\n');
			std::string_view line = text.substr(0, end);
			if (!line.empty() && line.back() == '\r')
				line.remove_suffix(1);
			lyrics.Lines.push_back({0, std::string(line)});
			text = end == std::string_view::npos ? std::string_view() : text.substr(end + 1);
		}
		while (!lyrics.Lines.empty() && lyrics.Lines.back().Text.empty())
			lyrics.Lines.pop_back();
		if (!lyrics.Lines.empty())
			lyrics.Type = player::LyricsType::Unsynced;
	}

	// A tag's text as the player shows it: synced lyrics come from the tag as LRC
	// text, which the SDK's own reader takes apart; anything else is plain text.
	void LyricsOfTagText(IAIMPCore *core, const std::string &text, player::Lyrics &lyrics)
	{
		IAIMPLyrics *parsed = nullptr;
		IAIMPString *string = StringToIAIMPString(core, text);
		if (string && Succeeded(core->CreateObject(IID_IAIMPLyrics, reinterpret_cast<void **>(&parsed))) && parsed &&
			Succeeded(parsed->LoadFromString(string, AIMP_LYRICS_FORMAT_LRC)))
		{
			INT32 type = AIMP_LYRICS_TYPE_UNKNOWN;
			parsed->GetValueAsInt32(AIMP_LYRICS_PROPID_TYPE, &type);
			if (type == AIMP_LYRICS_TYPE_SYNCED)
				CollectLines(parsed, lyrics);
		}
		if (parsed)
			parsed->Release();
		if (string)
			string->Release();
		if (lyrics.Lines.empty())
			LinesOfText(text, lyrics);
	}
}

player::MutationResult player::ReadLyrics(IAIMPCore *core, const LyricsItemFinder &findItem, Lyrics &lyrics)
{
	const Track track = RunOnMainThread(core, [&]
										{ return FindTrack(core, findItem); });
	if (track.Result != MutationResult::Ok)
		return track.Result;
	// In the player's own order: the lyrics tag, even with a file beside the
	// track; then the providers; then the comment tag, whatever it holds.
	if (!track.TagText.empty())
		LyricsOfTagText(core, track.TagText, lyrics);
	if (track.FileInfo)
	{
		if (lyrics.Lines.empty())
		{
			if (IAIMPServiceLyrics *service = AcquireService<IAIMPServiceLyrics>(core, IID_IAIMPServiceLyrics))
			{
				TTaskHandle task = 0;
				service->Get(track.FileInfo, AIMP_SERVICE_LYRICS_FLAGS_WAITFOR, OnLyricsReceived, &lyrics, &task);
				service->Release();
			}
		}
		track.FileInfo->Release();
	}
	if (lyrics.Lines.empty() && !track.Comment.empty())
		LyricsOfTagText(core, track.Comment, lyrics);
	return MutationResult::Ok;
}

player::MutationResult player::ReadLyrics(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, Lyrics &lyrics)
{
	return ReadLyrics(
		core, [&](IAIMPPlaylistItem *&item)
		{
			IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
			if (!playlist)
				return MutationResult::PlaylistNotFound;
			std::int32_t index = 0;
			item = FindItemByUri(playlist, fileUri, index);
			playlist->Release();
			return item ? MutationResult::Ok : MutationResult::ItemNotFound; },
		lyrics);
}
