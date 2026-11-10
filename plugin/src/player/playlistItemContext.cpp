#include "playlistItemContext.h"

#include "aimpHelper.h"

player::PlaylistItemContext::PlaylistItemContext(IAIMPServiceFileURI *fileUriService, IAIMPPlaylistItem *item)
	: FileUriService(fileUriService), Item(item)
{
	if (!item)
		return;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&FileInfo))))
		FileInfo = nullptr;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString, reinterpret_cast<void **>(&FileUri))))
		FileUri = nullptr;
}

player::PlaylistItemContext::~PlaylistItemContext()
{
	if (FileInfo)
		FileInfo->Release();
	if (FileUri)
		FileUri->Release();
}

IAIMPString *player::ItemFileName(const PlaylistItemContext &ctx)
{
	IAIMPString *value = nullptr;
	if (ctx.FileUriService && ctx.FileUri &&
		Failed(ctx.FileUriService->ExtractFileName(ctx.FileUri, reinterpret_cast<IAIMPString *>(&value))))
		value = nullptr;
	return value;
}

IAIMPString *player::ItemParentDirName(const PlaylistItemContext &ctx)
{
	IAIMPString *value = nullptr;
	if (ctx.FileUriService && ctx.FileUri &&
		Failed(ctx.FileUriService->ExtractFileParentDirName(ctx.FileUri, &value)))
		value = nullptr;
	return value;
}

IAIMPString *player::ItemFileInfoString(const PlaylistItemContext &ctx, int propId)
{
	IAIMPString *s = nullptr;
	if (ctx.FileInfo)
		ctx.FileInfo->GetValueAsObject(propId, IID_IAIMPString, reinterpret_cast<void **>(&s));
	return s;
}

IAIMPString *player::ItemTitleOrFileName(const PlaylistItemContext &ctx)
{
	IAIMPString *title = ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_TITLE);
	if (title && title->GetLength() > 0)
		return title;
	if (title)
		title->Release();
	return ItemFileName(ctx);
}

bool player::ItemIsUrl(const PlaylistItemContext &ctx)
{
	return ctx.FileUriService && ctx.FileUri && ctx.FileUriService->IsURL(ctx.FileUri) == S_OK;
}

bool player::ItemInContainer(const PlaylistItemContext &ctx)
{
	if (!ctx.FileUriService || !ctx.FileUri)
		return false;
	IAIMPString *container = nullptr;
	IAIMPString *part = nullptr;
	if (Failed(ctx.FileUriService->Parse(ctx.FileUri, &container, &part)))
		return false;
	const bool inContainer = part && part->GetLength() > 0;
	if (container)
		container->Release();
	if (part)
		part->Release();
	return inContainer;
}

bool player::PlaylistItemMatches(const PlaylistItemContext &ctx, IAIMPString *searchString, const SearchFields &fields)
{
	const auto contains = [&](IAIMPString *s)
	{
		INT32 index = -1;
		return s && Succeeded(s->Find(searchString, &index, AIMP_STRING_FIND_IGNORECASE, 0)) && index >= 0;
	};
	// For the strings the item helpers hand out, which are the caller's to release.
	const auto matches = [&](IAIMPString *s)
	{
		const bool found = contains(s);
		if (s)
			s->Release();
		return found;
	};
	return (fields.Title && matches(ItemTitleOrFileName(ctx))) ||
		   (fields.Artist && matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST))) ||
		   (fields.Album && matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM))) ||
		   (fields.Genre && matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_GENRE))) ||
		   (fields.Folder && matches(ItemParentDirName(ctx))) ||
		   (fields.File && contains(ctx.FileUri));
}
