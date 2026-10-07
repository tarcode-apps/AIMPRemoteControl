#pragma once

#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

#include "coverSource.h"

class IAIMPCore;
class IAIMPFileInfo;
class IAIMPPlaylist;
class IAIMPPlaylistItem;
class IAIMPServiceFileInfoFormatter;
class IAIMPString;
class PlaylistItemContext;

namespace player
{
	struct PlaylistItem
	{
		std::int32_t Index = 0;
		std::string DisplayText; // the first line as the player itself shows it
		std::string SecondLine;	 // formatted by the playlist's second-line template, empty when hidden
		double Duration = 0;	 // seconds
		std::int64_t Size = 0;	 // bytes
		double Rating = 0;		 // 0..5
		bool Enabled = true;
		bool IsUrl = false;
		CoverSource Cover;
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

	// Formats an item's second line by its playlist's template; nothing when the
	// playlist hides the line, unless `evenWhenHidden`.
	class SecondLineFormatter
	{
	public:
		SecondLineFormatter(IAIMPCore *core, IAIMPPlaylist *playlist, bool evenWhenHidden = false);
		~SecondLineFormatter();
		SecondLineFormatter(const SecondLineFormatter &) = delete;
		SecondLineFormatter &operator=(const SecondLineFormatter &) = delete;

		std::string Format(IAIMPFileInfo *fileInfo) const;

	private:
		IAIMPString *FTemplate = nullptr;
		IAIMPServiceFileInfoFormatter *FFormatter = nullptr;
	};

	PlaylistItem ReadPlaylistItem(const PlaylistItemContext &ctx, std::int32_t index, const SecondLineFormatter &secondLine);

	// Items of a playlist named in a request: everything that matches `Search` but
	// the indexes in `Except`, or, without a search, the `Indexes`.
	struct ItemSelection
	{
		std::optional<std::string> Search;
		std::vector<std::int32_t> Except;
		std::vector<std::int32_t> Indexes;
	};

	struct ItemsSummary
	{
		std::int32_t Count = 0;
		double Duration = 0;   // seconds
		std::int64_t Size = 0; // bytes
	};

	using ItemVisitor = std::function<void(const PlaylistItemContext &ctx, std::int32_t index)>;

	// Sorts the indexes, drops repeats and tells whether they all lie in `0..count-1`.
	bool NormalizeIndexes(std::vector<std::int32_t> &indexes, std::int32_t count);

	// Calls `visit` for the selected items in playlist order; false when an index
	// is outside the playlist.
	bool VisitSelectedItems(IAIMPCore *core, IAIMPPlaylist *playlist, const ItemSelection &selection, const ItemVisitor &visit);

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

	enum class MutationResult
	{
		Ok,
		PlaylistNotFound,
		PlaylistReadOnly,
		GroupNotFound,
		ItemNotFound,
		Failed
	};

	// The item at `index`, for the caller to release.
	MutationResult FindPlaylistItem(IAIMPCore *core, const std::string &playlistId, std::int32_t index, IAIMPPlaylistItem *&item);

	MutationResult SummarizePlaylistItems(IAIMPCore *core, const std::string &playlistId, const ItemSelection &selection,
										  ItemsSummary &summary);

	// Collapses or expands one group, or every group when `index` is nullopt.
	MutationResult SetGroupExpanded(IAIMPCore *core, const std::string &playlistId, std::optional<std::int32_t> index, bool expanded);

	enum class SortMode
	{
		Title,
		FileName,
		Duration,
		Artist,
		Inverse,
		Random,
		RandomGroups,
		RandomGroupItems,
		RandomAll,
		Template
	};

	struct SortOptions
	{
		SortMode Mode = SortMode::Title;
		std::string Template;	 // a file info formatter template, for SortMode::Template
		bool Descending = false; // for sorts by a field: the sort is followed by an inversion
	};

	MutationResult SortPlaylist(IAIMPCore *core, const std::string &playlistId, const SortOptions &options);

	// Moves the items at `indexes` to `target`, the index the first of them gets in the
	// resulting playlist. They keep their relative order.
	MutationResult MovePlaylistItems(IAIMPCore *core, const std::string &playlistId, std::vector<std::int32_t> indexes,
									 std::int32_t target);
}
