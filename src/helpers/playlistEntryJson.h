#pragma once

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "apiFileManager.h"
#include "apiPlaylists.h"

class PlaylistEntryContext
{
public:
	PlaylistEntryContext(IAIMPServiceFileURI *fileUriService, IAIMPPlaylistItem *item,
						 std::int32_t entryId, std::int32_t playlistId, std::int32_t queueIndex = -1);
	~PlaylistEntryContext();
	PlaylistEntryContext(const PlaylistEntryContext &) = delete;
	PlaylistEntryContext &operator=(const PlaylistEntryContext &) = delete;

	IAIMPServiceFileURI *const FileUriService;
	IAIMPPlaylistItem *const Item;
	IAIMPFileInfo *FileInfo = nullptr;
	IAIMPString *FileUri = nullptr;
	const std::int32_t EntryId;
	const std::int32_t PlaylistId;
	const std::int32_t QueueIndex;
};

nlohmann::json PlaylistEntryField(const std::string &field, const PlaylistEntryContext &ctx);

bool PlaylistEntryMatches(const PlaylistEntryContext &ctx, IAIMPString *searchString);
