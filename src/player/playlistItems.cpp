#include "playlistItems.h"

#include <algorithm>
#include <cctype>
#include <string_view>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
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

	class SecondLineFormatter
	{
	public:
		SecondLineFormatter(IAIMPCore *core, IAIMPPlaylist *playlist)
		{
			IAIMPPlaylistProperties *props = nullptr;
			if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
				return;
			INT32 visible = 0;
			props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_VIEW_SECOND_LINE, &visible);
			if (visible)
			{
				props->GetValueAsObject(AIMP_PLAYLIST_PROPID_FORMATING_LINE2_TEMPLATE, IID_IAIMPString, reinterpret_cast<void **>(&FTemplate));
				core->QueryInterface(IID_IAIMPServiceFileInfoFormatter, reinterpret_cast<void **>(&FFormatter));
			}
			props->Release();
		}

		~SecondLineFormatter()
		{
			if (FTemplate)
				FTemplate->Release();
			if (FFormatter)
				FFormatter->Release();
		}

		std::string Format(IAIMPFileInfo *fileInfo) const
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

	private:
		IAIMPString *FTemplate = nullptr;
		IAIMPServiceFileInfoFormatter *FFormatter = nullptr;
	};

	player::PlaylistItem ReadItem(const PlaylistItemContext &ctx, INT32 index, const SecondLineFormatter &secondLine)
	{
		player::PlaylistItem item;
		item.Index = index;
		item.DisplayText = GetPropertyAsString(ctx.Item, AIMP_PLAYLISTITEM_PROPID_DISPLAYTEXT);
		item.SecondLine = secondLine.Format(ctx.FileInfo);
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_DURATION, &item.Duration);
		ctx.Item->GetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, &item.Rating);
		INT32 enabled = 1;
		ctx.Item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, &enabled);
		item.Enabled = enabled != 0;
		item.IsUrl = ctx.FileUriService && ctx.FileUri && ctx.FileUriService->IsURL(ctx.FileUri) == S_OK;
		return item;
	}
}

std::int32_t player::VisitPlaylistItems(IAIMPCore *core, IAIMPPlaylist *playlist, const ItemsQuery &query, const ItemVisitor &visit)
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
		else if (PlaylistItemMatches(ctx, search))
		{
			if (matched >= query.Offset && matched - query.Offset < query.Limit)
				visit(ctx, i);
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
	page.Total = VisitPlaylistItems(core, playlist, query, [&](const PlaylistItemContext &ctx, std::int32_t index)
									{ page.Items.push_back(ReadItem(ctx, index, secondLine)); });
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
			const INT32 itemCount = group->GetItemCount();
			for (INT32 j = 0; j < itemCount; ++j)
			{
				IAIMPPlaylistItem *item = nullptr;
				if (Failed(group->GetItem(j, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
					continue;
				const PlaylistItemContext ctx(fileUriService, item);
				if (PlaylistItemMatches(ctx, searchString))
				{
					DOUBLE seconds = 0;
					if (ctx.FileInfo)
						ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_DURATION, &seconds);
					info.Duration += seconds;
					++info.Count;
				}
				item->Release();
			}
			info.FirstPosition = matchedBefore;
			matchedBefore += info.Count;
		}
		else
		{
			info.Count = group->GetItemCount();
			group->GetValueAsFloat(AIMP_PLAYLISTGROUP_PROPID_DURATION, &info.Duration);
			IAIMPPlaylistItem *first = nullptr;
			if (info.Count > 0 && Succeeded(group->GetItem(0, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&first))) && first)
			{
				first->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &info.FirstPosition);
				first->Release();
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

player::GroupResult player::SetGroupExpanded(IAIMPCore *core, const std::string &playlistId, std::optional<std::int32_t> index, bool expanded)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return GroupResult::PlaylistNotFound;

	const INT32 count = playlist->GetGroupCount();
	if (index && (*index < 0 || *index >= count))
	{
		playlist->Release();
		return GroupResult::GroupNotFound;
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
	return GroupResult::Ok;
}
