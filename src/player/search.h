#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "playlistItems.h"

class IAIMPCore;

namespace player
{
	// A text search over every loaded playlist, or over the named ones.
	struct SearchQuery
	{
		std::string Search;
		SearchFields Fields;
		std::optional<std::vector<std::string>> PlaylistIds;
		std::int32_t Offset = 0;
		std::int32_t Limit = 0;
	};

	struct SearchHit
	{
		std::string PlaylistId;
		PlaylistItem Item;
	};

	// A playlist with matches, in the order the hits come.
	struct SearchPlaylist
	{
		std::string Id;
		ItemsSummary Matches;
	};

	struct SearchResults
	{
		ItemsSummary Matches; // over the whole scope, not the page
		std::vector<SearchHit> Items;
		std::vector<SearchPlaylist> Playlists;
	};

	// The matches of `query` in playlist order, `Items` being the page `Offset` and
	// `Limit` cut out of them. Nullopt when one of `PlaylistIds` is not loaded.
	std::optional<SearchResults> SearchItems(IAIMPCore *core, const SearchQuery &query);
}
