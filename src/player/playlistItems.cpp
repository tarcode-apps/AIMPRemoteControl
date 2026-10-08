#include "playlistItems.h"

#include <algorithm>
#include <cctype>
#include <string_view>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "covers.h"
#include "playlistItemContext.h"

namespace
{
	bool EqualsIgnoreCase(const std::string &a, const char *b)
	{
		const std::string_view other(b);
		return a.size() == other.size() &&
			   std::equal(a.begin(), a.end(), other.begin(), [](unsigned char x, unsigned char y)
						  { return std::tolower(x) == std::tolower(y); });
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
	ctx.Item->GetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, &item.Rating);
	INT32 enabled = 1;
	ctx.Item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, &enabled);
	item.Enabled = enabled != 0;
	item.IsUrl = ctx.FileUriService && ctx.FileUri && ctx.FileUriService->IsURL(ctx.FileUri) == S_OK;
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
	// The indexes of the items of `groups` that match `search`, every item when it is
	// empty; false when a group is outside the playlist.
	bool GroupMatches(IAIMPCore *core, IAIMPPlaylist *playlist, std::vector<std::int32_t> groups, const std::string &search,
					  const SearchFields &fields, const std::function<void(std::int32_t)> &match)
	{
		std::sort(groups.begin(), groups.end());
		groups.erase(std::unique(groups.begin(), groups.end()), groups.end());
		if (!groups.empty() && (groups.front() < 0 || groups.back() >= playlist->GetGroupCount()))
			return false;
		IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
		IAIMPString *searchString = search.empty() ? nullptr : StringToIAIMPString(core, search);
		for (const std::int32_t index : groups)
		{
			IAIMPPlaylistGroup *group = nullptr;
			if (Failed(playlist->GetGroup(index, IID_IAIMPPlaylistGroup, reinterpret_cast<void **>(&group))) || !group)
				continue;
			const INT32 count = group->GetItemCount();
			for (INT32 j = 0; j < count; ++j)
			{
				IAIMPPlaylistItem *item = nullptr;
				if (Failed(group->GetItem(j, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
					continue;
				const PlaylistItemContext ctx(fileUriService, item);
				INT32 itemIndex = -1;
				if ((!searchString || PlaylistItemMatches(ctx, searchString, fields)) &&
					Succeeded(item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &itemIndex)))
					match(itemIndex);
				item->Release();
			}
			group->Release();
		}
		if (searchString)
			searchString->Release();
		if (fileUriService)
			fileUriService->Release();
		return true;
	}
}

bool player::VisitSelectedItems(IAIMPCore *core, IAIMPPlaylist *playlist, const ItemSelection &selection, const ItemVisitor &visit)
{
	// The matches are gathered first, so that they and the extra indexes come in
	// playlist order together.
	std::vector<std::int32_t> indexes = selection.Indexes;
	if (selection.Search)
	{
		std::vector<std::int32_t> except = selection.Except;
		std::sort(except.begin(), except.end());
		const auto match = [&](std::int32_t index)
		{
			if (!std::binary_search(except.begin(), except.end(), index))
				indexes.push_back(index);
		};
		if (selection.Groups)
		{
			if (!GroupMatches(core, playlist, *selection.Groups, *selection.Search, selection.Fields, match))
				return false;
		}
		else
		{
			ItemsQuery query;
			query.Limit = INT32_MAX;
			query.Search = *selection.Search;
			query.Fields = selection.Fields;
			VisitPlaylistItems(core, playlist, query, [&](const PlaylistItemContext &, std::int32_t index)
							   { match(index); });
		}
	}

	if (!NormalizeIndexes(indexes, playlist->GetItemCount()))
		return false;
	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	for (const std::int32_t index : indexes)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(playlist->GetItem(index, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			continue;
		const PlaylistItemContext ctx(fileUriService, item);
		visit(ctx, index);
		item->Release();
	}
	if (fileUriService)
		fileUriService->Release();
	return true;
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
					AddToSummary(ctx, matches);
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

player::MutationResult player::DescribePlaylistItems(IAIMPCore *core, const std::string &playlistId, const ItemSelection &selection,
													 std::vector<ItemDetails> &items)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	const SecondLineFormatter secondLine(core, playlist, true);
	items.clear();
	const bool found = VisitSelectedItems(core, playlist, selection, [&](const PlaylistItemContext &ctx, std::int32_t index)
										  {
		ItemDetails details;
		details.Item = ReadPlaylistItem(ctx, index, secondLine);
		details.Artist = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST));
		details.Album = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM));
		details.Genre = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_GENRE));
		details.Year = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_DATE));
		details.Folder = ToStringAndRelease(ItemParentDirName(ctx));
		items.push_back(std::move(details)); });
	playlist->Release();
	return found ? MutationResult::Ok : MutationResult::ItemNotFound;
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
	bool IsReadOnly(IAIMPPlaylist *playlist)
	{
		IAIMPPlaylistProperties *props = nullptr;
		if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
			return false;
		INT32 readOnly = 0;
		props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_READONLY, &readOnly);
		props->Release();
		return readOnly != 0;
	}

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
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	if (IsReadOnly(playlist))
	{
		playlist->Release();
		return MutationResult::PlaylistReadOnly;
	}

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
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	if (IsReadOnly(playlist))
	{
		playlist->Release();
		return MutationResult::PlaylistReadOnly;
	}

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
