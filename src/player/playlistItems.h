#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

class IAIMPCore;
class IAIMPPlaylist;
class PlaylistItemContext;

namespace player
{
	struct PlaylistItem
	{
		std::int32_t Index = 0;
		std::string DisplayText; // the first line as the player itself shows it
		std::string SecondLine;	 // formatted by the playlist's second-line template, empty when hidden
		double Duration = 0;	 // seconds
		double Rating = 0;		 // 0..5
		bool Enabled = true;
		bool IsUrl = false;
	};

	struct ItemsQuery
	{
		std::int32_t Offset = 0;
		std::int32_t Limit = 0;
		std::string Search;
	};

	struct ItemsPage
	{
		std::int32_t Total = 0;
		std::int32_t Offset = 0;
		std::vector<PlaylistItem> Items;
	};

	struct PlaylistGroup
	{
		std::int32_t Index = 0;
		std::string Name;
		std::int32_t Count = 0;
		double Duration = 0; // seconds
		bool Expanded = true;
		std::int32_t FirstPosition = 0; // playlist index of the group's first item
	};

	using ItemVisitor = std::function<void(const PlaylistItemContext &ctx, std::int32_t index)>;

	// Calls `visit` for the items selected by `query`, in playlist order. Returns how
	// many items match `Search` in the whole playlist, or the item count when the
	// search is empty, regardless of `Offset` and `Limit`.
	std::int32_t VisitPlaylistItems(IAIMPCore *core, IAIMPPlaylist *playlist, const ItemsQuery &query, const ItemVisitor &visit);

	// Nullopt when the playlist is not loaded. `Total` counts the matches of `Search`
	// over the whole playlist, or every item when the search is empty.
	std::optional<ItemsPage> GetPlaylistItems(IAIMPCore *core, const std::string &playlistId, const ItemsQuery &query);

	// Nullopt when the playlist is not loaded; empty when it is not grouped. With a
	// search, `Count`, `Duration` and `FirstPosition` describe the matching items only,
	// positions counting through the matches, and groups without matches are left out.
	std::optional<std::vector<PlaylistGroup>> GetPlaylistGroups(IAIMPCore *core, const std::string &playlistId,
																  const std::string &search = {});

	enum class GroupResult
	{
		Ok,
		PlaylistNotFound,
		GroupNotFound
	};

	// Collapses or expands one group, or every group when `index` is nullopt.
	GroupResult SetGroupExpanded(IAIMPCore *core, const std::string &playlistId, std::optional<std::int32_t> index, bool expanded);
}
