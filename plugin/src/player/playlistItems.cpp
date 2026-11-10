#include "playlistItems.h"

#include <algorithm>
#include <cctype>
#include <string_view>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "covers.h"
#include "fileAccess.h"
#include "playlistItemContext.h"
#include "playlists.h"

namespace
{
	bool EqualsIgnoreCase(const std::string &a, const char *b)
	{
		const std::string_view other(b);
		return a.size() == other.size() &&
			   std::equal(a.begin(), a.end(), other.begin(), [](unsigned char x, unsigned char y)
						  { return std::tolower(x) == std::tolower(y); });
	}

	bool ItemEnabled(IAIMPPlaylistItem *item)
	{
		INT32 enabled = 1;
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, &enabled);
		return enabled != 0;
	}
}

player::SecondLineFormatter::SecondLineFormatter(IAIMPCore *core, IAIMPPlaylist *playlist, bool evenWhenHidden)
{
	IAIMPPlaylistProperties *props = nullptr;
	if (!playlist || Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
		return;
	INT32 visible = 0;
	props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_VIEW_SECOND_LINE, &visible);
	if (visible || evenWhenHidden)
	{
		props->GetValueAsObject(AIMP_PLAYLIST_PROPID_FORMATING_LINE2_TEMPLATE, IID_IAIMPString, reinterpret_cast<void **>(&FTemplate));
		core->QueryInterface(IID_IAIMPServiceFileInfoFormatter, reinterpret_cast<void **>(&FFormatter));
	}
	props->Release();
}

player::SecondLineFormatter::~SecondLineFormatter()
{
	if (FTemplate)
		FTemplate->Release();
	if (FFormatter)
		FFormatter->Release();
}

std::string player::SecondLineFormatter::Format(IAIMPFileInfo *fileInfo) const
{
	if (!FTemplate || !FFormatter || !fileInfo)
		return {};
	IAIMPString *result = nullptr;
	if (Failed(FFormatter->Format(FTemplate, fileInfo, AIMP_FILEINFO_FORMATTER_ID_BASIC, nullptr, &result)) || !result)
		return {};
	std::string text = IAIMPStringToString(result);
	result->Release();
	return text;
}

player::PlaylistItem player::ReadPlaylistItem(const PlaylistItemContext &ctx, std::int32_t index, const SecondLineFormatter &secondLine)
{
	PlaylistItem item;
	item.Index = index;
	item.DisplayText = GetPropertyAsString(ctx.Item, AIMP_PLAYLISTITEM_PROPID_DISPLAYTEXT);
	item.SecondLine = secondLine.Format(ctx.FileInfo);
	if (ctx.FileInfo)
	{
		ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_DURATION, &item.Duration);
		INT64 size = 0;
		ctx.FileInfo->GetValueAsInt64(AIMP_FILEINFO_PROPID_FILESIZE, &size);
		item.Size = size;
	}
	item.Marks = ReadMarks(ctx.FileInfo);
	item.Enabled = ItemEnabled(ctx.Item);
	item.IsUrl = ItemIsUrl(ctx);
	item.InContainer = ItemInContainer(ctx);
	if (ctx.FileInfo)
		item.Cover = DescribeCoverSource(ctx.FileInfo, item.IsUrl);
	if (ctx.FileUri)
		item.FileUri = IAIMPStringToString(ctx.FileUri);
	return item;
}

bool player::NormalizeIndexes(std::vector<std::int32_t> &indexes, std::int32_t count)
{
	std::sort(indexes.begin(), indexes.end());
	indexes.erase(std::unique(indexes.begin(), indexes.end()), indexes.end());
	return indexes.empty() || (indexes.front() >= 0 && indexes.back() < count);
}

namespace
{
	// The indexes of the items selected in one playlist, sorted and without repeats;
	// false when an index or a position is outside the playlist or the search's list.
	bool ResolveInPlaylist(IAIMPCore *core, IAIMPPlaylist *playlist, const player::ItemsSelection &selection,
						   const player::PlaylistSelection &entry, std::vector<std::int32_t> &indexes)
	{
		indexes = entry.Indexes;
		if (!entry.Ranges.empty())
		{
			std::vector<std::pair<std::int32_t, std::int32_t>> ranges = entry.Ranges;
			std::sort(ranges.begin(), ranges.end());
			std::int32_t last = -1;
			for (const auto &[from, to] : ranges)
				last = std::max(last, to);
			// The ranges are walked along with the positions: a range is left behind
			// once the positions pass its end, and none ahead of the current one can
			// hold the position, as they start no earlier than it does.
			std::size_t current = 0;
			std::int32_t position = 0;
			player::ItemsQuery query;
			query.Limit = INT32_MAX;
			query.Search = selection.Search;
			query.Fields = selection.Fields;
			player::VisitPlaylistItems(core, playlist, query, [&](const player::PlaylistItemContext &, std::int32_t index)
									   {
				while (current < ranges.size() && ranges[current].second < position)
					++current;
				if (current < ranges.size() && ranges[current].first <= position)
					indexes.push_back(index);
				++position; });
			if (last >= position)
				return false;
		}
		return player::NormalizeIndexes(indexes, playlist->GetItemCount());
	}
}

player::MutationResult player::ResolveSelection(IAIMPCore *core, const ItemsSelection &selection, bool writable,
												std::vector<ResolvedPlaylist> &resolved, std::size_t &failedPlaylist)
{
	resolved.clear();
	const std::vector<PlaylistSelection> &playlists = selection.Playlists;
	for (std::size_t i = 0; i < playlists.size(); ++i)
	{
		const PlaylistSelection &entry = playlists[i];
		ResolvedPlaylist playlist;
		playlist.PlaylistId = entry.PlaylistId;
		MutationResult result = MutationResult::Ok;
		if (writable)
			result = OpenWritablePlaylist(core, entry.PlaylistId, playlist.Playlist);
		else if (!(playlist.Playlist = LoadedPlaylistByAIMPId(core, entry.PlaylistId)))
			result = MutationResult::PlaylistNotFound;
		if (result == MutationResult::Ok && !ResolveInPlaylist(core, playlist.Playlist, selection, entry, playlist.Indexes))
			result = MutationResult::ItemNotFound;
		if (result != MutationResult::Ok)
		{
			resolved.clear();
			failedPlaylist = i;
			return result;
		}
		resolved.push_back(std::move(playlist));
	}
	return MutationResult::Ok;
}

void player::VisitResolvedItems(IAIMPCore *core, const ResolvedPlaylist &playlist, const ItemVisitor &visit)
{
	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	for (const std::int32_t index : playlist.Indexes)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(playlist.Playlist->GetItem(index, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			continue;
		const PlaylistItemContext ctx(fileUriService, item);
		visit(ctx, index);
		item->Release();
	}
	if (fileUriService)
		fileUriService->Release();
}

std::int32_t player::VisitPlaylistItems(IAIMPCore *core, IAIMPPlaylist *playlist, const ItemsQuery &query, const ItemVisitor &visit,
										ItemsSummary *matches)
{
	IAIMPServiceFileURI *fileUriService = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService))))
		fileUriService = nullptr;
	IAIMPString *search = query.Search.empty() ? nullptr : StringToIAIMPString(core, query.Search);

	const INT32 count = playlist->GetItemCount();
	const INT32 end = search || query.Limit >= count - query.Offset ? count : query.Offset + query.Limit;
	INT32 matched = 0;
	for (INT32 i = search ? 0 : query.Offset; i < end; ++i)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(playlist->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			continue;
		const PlaylistItemContext ctx(fileUriService, item);
		if (!search)
			visit(ctx, i);
		else if (PlaylistItemMatches(ctx, search, query.Fields))
		{
			if (matched >= query.Offset && matched - query.Offset < query.Limit)
				visit(ctx, i);
			if (matches)
				AddToSummary(ctx, *matches);
			++matched;
		}
		item->Release();
	}

	if (search)
		search->Release();
	if (fileUriService)
		fileUriService->Release();
	return search ? matched : count;
}

std::optional<player::ItemsPage> player::GetPlaylistItems(IAIMPCore *core, const std::string &playlistId, const ItemsQuery &query)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return std::nullopt;

	const SecondLineFormatter secondLine(core, playlist);
	ItemsPage page;
	page.Offset = query.Offset;
	ItemsSummary matches;
	page.Total = VisitPlaylistItems(core, playlist, query, [&](const PlaylistItemContext &ctx, std::int32_t index)
									{ page.Items.push_back(ReadPlaylistItem(ctx, index, secondLine)); }, &matches);
	if (!query.Search.empty())
		page.Matches = matches;
	playlist->Release();
	return page;
}

std::optional<std::vector<player::PlaylistGroup>> player::GetPlaylistGroups(IAIMPCore *core, const std::string &playlistId,
																			  const std::string &search)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return std::nullopt;

	IAIMPServiceFileURI *fileUriService = nullptr;
	if (search.empty() || Failed(core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService))))
		fileUriService = nullptr;
	IAIMPString *searchString = search.empty() ? nullptr : StringToIAIMPString(core, search);
	INT32 matchedBefore = 0;

	// The player shows folder groups by the folder name alone while the group's name
	// property keeps the full path.
	bool folderGroups = false;
	IAIMPPlaylistProperties *props = nullptr;
	if (Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
	{
		folderGroups = EqualsIgnoreCase(GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_GROUPPING_TEMPLATE), "%FileDir");
		props->Release();
	}

	std::vector<PlaylistGroup> groups;
	const INT32 count = playlist->GetGroupCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylistGroup *group = nullptr;
		if (Failed(playlist->GetGroup(i, IID_IAIMPPlaylistGroup, reinterpret_cast<void **>(&group))) || !group)
			continue;
		PlaylistGroup info;
		info.Index = i;
		info.Name = GetPropertyAsString(group, AIMP_PLAYLISTGROUP_PROPID_NAME);
		if (folderGroups)
		{
			const std::size_t separator = info.Name.find_last_of("\\/");
			if (separator != std::string::npos && separator + 1 < info.Name.size())
				info.Name.erase(0, separator + 1);
		}
		INT32 expanded = 1;
		group->GetValueAsInt32(AIMP_PLAYLISTGROUP_PROPID_EXPANDED, &expanded);
		info.Expanded = expanded != 0;
		if (searchString)
		{
			ItemsSummary matches;
			const INT32 itemCount = group->GetItemCount();
			for (INT32 j = 0; j < itemCount; ++j)
			{
				IAIMPPlaylistItem *item = nullptr;
				if (Failed(group->GetItem(j, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
					continue;
				const PlaylistItemContext ctx(fileUriService, item);
				if (PlaylistItemMatches(ctx, searchString))
				{
					AddToSummary(ctx, matches);
					info.EnabledCount += ItemEnabled(item);
				}
				item->Release();
			}
			info.Count = matches.Count;
			info.Duration = matches.Duration;
			info.Size = matches.Size;
			info.FirstPosition = matchedBefore;
			matchedBefore += info.Count;
		}
		else
		{
			info.Count = group->GetItemCount();
			group->GetValueAsFloat(AIMP_PLAYLISTGROUP_PROPID_DURATION, &info.Duration);
			// The group keeps no size of its own.
			for (INT32 j = 0; j < info.Count; ++j)
			{
				IAIMPPlaylistItem *item = nullptr;
				if (Failed(group->GetItem(j, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
					continue;
				if (j == 0)
					item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &info.FirstPosition);
				info.EnabledCount += ItemEnabled(item);
				IAIMPFileInfo *fileInfo = nullptr;
				if (Succeeded(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&fileInfo))) && fileInfo)
				{
					INT64 size = 0;
					fileInfo->GetValueAsInt64(AIMP_FILEINFO_PROPID_FILESIZE, &size);
					info.Size += size;
					fileInfo->Release();
				}
				item->Release();
			}
		}
		if (!searchString || info.Count > 0)
			groups.push_back(std::move(info));
		group->Release();
	}
	if (searchString)
		searchString->Release();
	if (fileUriService)
		fileUriService->Release();
	playlist->Release();
	return groups;
}

player::MutationResult player::FindPlaylistItem(IAIMPCore *core, const std::string &playlistId, std::int32_t index, IAIMPPlaylistItem *&item)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	item = nullptr;
	if (index < 0 || index >= playlist->GetItemCount() ||
		Failed(playlist->GetItem(index, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))))
		item = nullptr;
	playlist->Release();
	return item ? MutationResult::Ok : MutationResult::ItemNotFound;
}

player::TrackMarks player::ReadMarks(IAIMPFileInfo *info)
{
	TrackMarks marks;
	if (!info)
		return marks;
	info->GetValueAsInt32(AIMP_FILEINFO_PROPID_ML_MARK, &marks.Mark);
	info->GetValueAsFloat(AIMP_FILEINFO_PROPID_ML_RATING, &marks.Rating);
	info->GetValueAsFloat(AIMP_FILEINFO_PROPID_ML_DISPLAYING_MARK, &marks.DisplayingMark);
	return marks;
}

IAIMPPlaylistItem *player::FindItemByUri(IAIMPPlaylist *playlist, const std::string &fileUri, std::int32_t &index)
{
	const INT32 count = playlist->GetItemCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(playlist->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			continue;
		if (GetPropertyAsString(item, AIMP_PLAYLISTITEM_PROPID_FILENAME) == fileUri)
		{
			index = i;
			return item;
		}
		item->Release();
	}
	return nullptr;
}

player::MutationResult player::SetItemMark(IAIMPCore *core, const std::string &playlistId, std::int32_t index, std::int32_t mark)
{
	IAIMPPlaylistItem *item = nullptr;
	const MutationResult found = FindPlaylistItem(core, playlistId, index, item);
	if (found != MutationResult::Ok)
		return found;
	const HRESULT hr = item->SetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, mark);
	item->Release();
	return Succeeded(hr) ? MutationResult::Ok : MutationResult::Failed;
}

player::MutationResult player::SetItemEnabled(IAIMPCore *core, const std::string &playlistId, std::int32_t index, bool enabled)
{
	IAIMPPlaylistItem *item = nullptr;
	const MutationResult found = FindPlaylistItem(core, playlistId, index, item);
	if (found != MutationResult::Ok)
		return found;
	const HRESULT hr = item->SetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, enabled ? 1 : 0);
	item->Release();
	return Succeeded(hr) ? MutationResult::Ok : MutationResult::Failed;
}

player::MutationResult player::SetItemsEnabled(IAIMPCore *core, const ItemsSelection &selection, bool enabled, std::size_t &failedPlaylist)
{
	std::vector<ResolvedPlaylist> resolved;
	MutationResult result = ResolveSelection(core, selection, false, resolved, failedPlaylist);
	for (std::size_t i = 0; i < resolved.size() && result == MutationResult::Ok; ++i)
	{
		resolved[i].Playlist->BeginUpdate();
		VisitResolvedItems(core, resolved[i], [&](const PlaylistItemContext &ctx, std::int32_t)
						   {
			if (Failed(ctx.Item->SetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, enabled ? 1 : 0)))
				result = MutationResult::Failed; });
		resolved[i].Playlist->EndUpdate();
		if (result != MutationResult::Ok)
			failedPlaylist = i;
	}
	return result;
}

void player::AddToSummary(const PlaylistItemContext &ctx, ItemsSummary &summary)
{
	if (ctx.FileInfo)
	{
		DOUBLE duration = 0;
		INT64 size = 0;
		ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_DURATION, &duration);
		ctx.FileInfo->GetValueAsInt64(AIMP_FILEINFO_PROPID_FILESIZE, &size);
		summary.Duration += duration;
		summary.Size += size;
	}
	++summary.Count;
}

player::MutationResult player::DescribeItems(IAIMPCore *core, const ItemsSelection &selection, std::vector<ItemDetails> &items,
											 std::size_t &failedPlaylist)
{
	std::vector<ResolvedPlaylist> resolved;
	const MutationResult result = ResolveSelection(core, selection, false, resolved, failedPlaylist);
	items.clear();
	for (const ResolvedPlaylist &playlist : resolved)
	{
		const SecondLineFormatter secondLine(core, playlist.Playlist, true);
		VisitResolvedItems(core, playlist, [&](const PlaylistItemContext &ctx, std::int32_t index)
						   {
			ItemDetails details;
			details.PlaylistId = playlist.PlaylistId;
			details.Item = ReadPlaylistItem(ctx, index, secondLine);
			details.Artist = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST));
			details.Album = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM));
			details.Genre = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_GENRE));
			details.Year = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_DATE));
			details.Folder = ToStringAndRelease(ItemParentDirName(ctx));
			items.push_back(std::move(details)); });
	}
	return result;
}

player::MutationResult player::SummarizeItems(IAIMPCore *core, const ItemsSelection &selection, ItemsSummary &summary,
											  std::size_t &failedPlaylist)
{
	std::vector<ResolvedPlaylist> resolved;
	const MutationResult result = ResolveSelection(core, selection, false, resolved, failedPlaylist);
	summary = {};
	for (const ResolvedPlaylist &playlist : resolved)
		VisitResolvedItems(core, playlist, [&](const PlaylistItemContext &ctx, std::int32_t)
						   { AddToSummary(ctx, summary); });
	return result;
}

player::MutationResult player::SetGroupExpanded(IAIMPCore *core, const std::string &playlistId, std::optional<std::int32_t> index, bool expanded)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;

	const INT32 count = playlist->GetGroupCount();
	if (index && (*index < 0 || *index >= count))
	{
		playlist->Release();
		return MutationResult::GroupNotFound;
	}

	const INT32 first = index ? *index : 0;
	const INT32 last = index ? *index + 1 : count;
	playlist->BeginUpdate();
	for (INT32 i = first; i < last; ++i)
	{
		IAIMPPlaylistGroup *group = nullptr;
		if (Succeeded(playlist->GetGroup(i, IID_IAIMPPlaylistGroup, reinterpret_cast<void **>(&group))) && group)
		{
			group->SetValueAsInt32(AIMP_PLAYLISTGROUP_PROPID_EXPANDED, expanded ? 1 : 0);
			group->Release();
		}
	}
	playlist->EndUpdate();
	playlist->Release();
	return MutationResult::Ok;
}

namespace
{
	HRESULT Sort(IAIMPCore *core, IAIMPPlaylist *playlist, const player::SortOptions &options)
	{
		using player::SortMode;
		switch (options.Mode)
		{
		case SortMode::Title:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_TITLE);
		case SortMode::FileName:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_FILENAME);
		case SortMode::Duration:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_DURATION);
		case SortMode::Artist:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_ARTIST);
		case SortMode::Inverse:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_INVERSE);
		case SortMode::Random:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_RANDOMIZE);
		case SortMode::RandomGroups:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_RANDOMIZE_GROUPS);
		case SortMode::RandomGroupItems:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_RANDOMIZE_GROUPITEMS);
		case SortMode::RandomAll:
			return playlist->Sort(AIMP_PLAYLIST_SORTMODE_RANDOMIZE_GROUPS_AND_IT_ITEMS);
		case SortMode::Template:
		{
			IAIMPString *sortTemplate = StringToIAIMPString(core, options.Template);
			if (!sortTemplate)
				return E_OUTOFMEMORY;
			const HRESULT result = playlist->Sort2(sortTemplate);
			sortTemplate->Release();
			return result;
		}
		}
		return E_INVALIDARG;
	}
}

player::MutationResult player::SortPlaylist(IAIMPCore *core, const std::string &playlistId, const SortOptions &options)
{
	IAIMPPlaylist *playlist = nullptr;
	if (const MutationResult opened = OpenWritablePlaylist(core, playlistId, playlist); opened != MutationResult::Ok)
		return opened;

	playlist->BeginUpdate();
	HRESULT result = Sort(core, playlist, options);
	if (Succeeded(result) && options.Descending)
		result = playlist->Sort(AIMP_PLAYLIST_SORTMODE_INVERSE);
	playlist->EndUpdate();
	playlist->Release();
	return Succeeded(result) ? MutationResult::Ok : MutationResult::Failed;
}

player::MutationResult player::MovePlaylistItems(IAIMPCore *core, const std::string &playlistId, std::vector<std::int32_t> indexes,
												 std::int32_t target)
{
	IAIMPPlaylist *playlist = nullptr;
	if (const MutationResult opened = OpenWritablePlaylist(core, playlistId, playlist); opened != MutationResult::Ok)
		return opened;

	const std::int32_t count = playlist->GetItemCount();
	const bool inside = NormalizeIndexes(indexes, count);
	const std::int32_t moved = static_cast<std::int32_t>(indexes.size());
	if (!inside || moved == 0 || target < 0 || target > count - moved)
	{
		playlist->Release();
		return MutationResult::ItemNotFound;
	}

	// Writing the index of an item takes it out of the playlist and puts it back at
	// the new index. `pivot` is the current index of the item that will follow the
	// moved block. The items above it go just before it, from the bottom up, each one
	// landing before the previously placed one; the items below it go right after it,
	// from the top down. In both directions the remaining indexes stay valid.
	std::int32_t pivot = 0;
	for (std::int32_t skipped = 0; pivot < count && pivot - skipped < target; ++pivot)
		if (skipped < moved && indexes[skipped] == pivot)
			++skipped;
	while (pivot < count && std::binary_search(indexes.begin(), indexes.end(), pivot))
		++pivot;

	std::vector<IAIMPPlaylistItem *> items(moved, nullptr);
	bool found = true;
	for (std::int32_t i = 0; i < moved && found; ++i)
		found = Succeeded(playlist->GetItem(indexes[i], IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&items[i]))) && items[i];

	HRESULT result = found ? S_OK : E_FAIL;
	if (found)
	{
		playlist->BeginUpdate();
		const auto below = std::lower_bound(indexes.begin(), indexes.end(), pivot) - indexes.begin();
		for (std::int32_t i = static_cast<std::int32_t>(below) - 1, placed = 0; i >= 0 && Succeeded(result); --i, ++placed)
			result = items[i]->SetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, pivot - 1 - placed);
		for (std::int32_t i = static_cast<std::int32_t>(below), placed = 0; i < moved && Succeeded(result); ++i, ++placed)
			result = items[i]->SetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, pivot + placed);
		playlist->EndUpdate();
	}
	for (IAIMPPlaylistItem *item : items)
		if (item)
			item->Release();
	playlist->Release();
	return found ? (Succeeded(result) ? MutationResult::Ok : MutationResult::Failed) : MutationResult::ItemNotFound;
}

namespace
{
	BOOL WINAPI DeleteListed(IAIMPPlaylistItem *item, void *userData)
	{
		const auto &indexes = *static_cast<const std::vector<std::int32_t> *>(userData);
		INT32 index = -1;
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
		return std::binary_search(indexes.begin(), indexes.end(), index);
	}
}

HRESULT player::DeleteItems(IAIMPPlaylist *playlist, const std::vector<std::int32_t> &indexes, bool physically)
{
	// The client confirms the deletion itself.
	DWORD flags = AIMP_PLAYLIST_DELETE_FLAGS_NOCONFIRMATION;
	if (physically)
		flags |= AIMP_PLAYLIST_DELETE_FLAGS_PHYSICALLY;
	return playlist->Delete3(flags, DeleteListed, const_cast<std::vector<std::int32_t> *>(&indexes));
}

player::MutationResult player::RemoveItems(IAIMPCore *core, const ItemsSelection &selection, bool physically,
										   std::vector<std::string> &undeletable, std::size_t &failedPlaylist)
{
	std::vector<ResolvedPlaylist> resolved;
	MutationResult result = ResolveSelection(core, selection, true, resolved, failedPlaylist);
	for (std::size_t i = 0; i < resolved.size() && physically && result == MutationResult::Ok; ++i)
	{
		VisitResolvedItems(core, resolved[i], [&](const PlaylistItemContext &ctx, std::int32_t)
						   {
			if (ItemInContainer(ctx))
				result = MutationResult::ItemInContainer;
			else if (ctx.FileUri && !ItemIsUrl(ctx))
			{
				const std::string path = IAIMPStringToString(ctx.FileUri);
				if (!CanDeleteFile(path))
					undeletable.push_back(path);
			} });
		if (result != MutationResult::Ok)
			failedPlaylist = i;
	}
	if (physically && result == MutationResult::Ok)
	{
		std::sort(undeletable.begin(), undeletable.end());
		undeletable.erase(std::unique(undeletable.begin(), undeletable.end()), undeletable.end());
		if (!undeletable.empty())
			result = MutationResult::FilesNotDeletable;
	}
	for (std::size_t i = 0; i < resolved.size() && result == MutationResult::Ok; ++i)
		if (!resolved[i].Indexes.empty() && Failed(DeleteItems(resolved[i].Playlist, resolved[i].Indexes, physically)))
		{
			result = MutationResult::Failed;
			failedPlaylist = i;
		}
	return result;
}

bool player::MoveFocus(IAIMPPlaylistItem *item, int delta)
{
	IAIMPPlaylist *playlist = nullptr;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist))) || !playlist)
		return false;
	INT32 index = 0;
	item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
	const INT32 count = playlist->GetItemCount();

	bool moved = false;
	IAIMPPlaylistProperties *props = nullptr;
	if (count > 0 && Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
	{
		const INT32 target = ((index + delta) % count + count) % count;
		moved = Succeeded(props->SetValueAsInt32(AIMP_PLAYLIST_PROPID_FOCUSINDEX, target));
		props->Release();
	}
	playlist->Release();
	return moved;
}
