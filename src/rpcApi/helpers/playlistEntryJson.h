#pragma once

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "playlistItemContext.h"

// The protocol's ids of an entry, see docs/remote-control-protocol.md.
struct PlaylistEntryIds
{
	std::int32_t EntryId = 0;
	std::int32_t PlaylistId = 0;
	std::int32_t QueueIndex = -1;
};

// One field of an entry by its protocol name; null for unknown names.
nlohmann::json PlaylistEntryField(const std::string &field, const PlaylistItemContext &ctx, const PlaylistEntryIds &ids);
