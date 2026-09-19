#pragma once

#include <string>

#include "apiFileManager.h"
#include "apiPlaylists.h"

// The item together with the file info and URI that most fields are read from.
class PlaylistItemContext
{
public:
	PlaylistItemContext(IAIMPServiceFileURI *fileUriService, IAIMPPlaylistItem *item);
	~PlaylistItemContext();
	PlaylistItemContext(const PlaylistItemContext &) = delete;
	PlaylistItemContext &operator=(const PlaylistItemContext &) = delete;

	IAIMPServiceFileURI *const FileUriService;
	IAIMPPlaylistItem *const Item;
	IAIMPFileInfo *FileInfo = nullptr;
	IAIMPString *FileUri = nullptr;
};

std::string ToStringAndRelease(IAIMPString *s);

// Callers release the returned strings; null when unavailable.
IAIMPString *ItemFileName(const PlaylistItemContext &ctx);
IAIMPString *ItemParentDirName(const PlaylistItemContext &ctx);
IAIMPString *ItemFileInfoString(const PlaylistItemContext &ctx, int propId);
// The tag title, or the file name when the tag is empty, as the player shows it.
IAIMPString *ItemTitleOrFileName(const PlaylistItemContext &ctx);

// Case-insensitive substring search over title, artist, album, genre and folder name.
bool PlaylistItemMatches(const PlaylistItemContext &ctx, IAIMPString *searchString);
