#include "playlistItemContext.h"

#include "aimpHelper.h"

PlaylistItemContext::PlaylistItemContext(IAIMPServiceFileURI *fileUriService, IAIMPPlaylistItem *item)
	: FileUriService(fileUriService), Item(item)
{
	if (!item)
		return;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&FileInfo))))
		FileInfo = nullptr;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString, reinterpret_cast<void **>(&FileUri))))
		FileUri = nullptr;
}

PlaylistItemContext::~PlaylistItemContext()
{
	if (FileInfo)
		FileInfo->Release();
	if (FileUri)
		FileUri->Release();
}

std::string ToStringAndRelease(IAIMPString *s)
{
	if (!s)
		return {};
	std::string result = IAIMPStringToString(s);
	s->Release();
	return result;
}

IAIMPString *ItemFileName(const PlaylistItemContext &ctx)
{
	IAIMPString *value = nullptr;
	if (ctx.FileUriService && ctx.FileUri &&
		Failed(ctx.FileUriService->ExtractFileName(ctx.FileUri, reinterpret_cast<IAIMPString *>(&value))))
		value = nullptr;
	return value;
}

IAIMPString *ItemParentDirName(const PlaylistItemContext &ctx)
{
	IAIMPString *value = nullptr;
	if (ctx.FileUriService && ctx.FileUri &&
		Failed(ctx.FileUriService->ExtractFileParentDirName(ctx.FileUri, &value)))
		value = nullptr;
	return value;
}

IAIMPString *ItemFileInfoString(const PlaylistItemContext &ctx, int propId)
{
	IAIMPString *s = nullptr;
	if (ctx.FileInfo)
		ctx.FileInfo->GetValueAsObject(propId, IID_IAIMPString, reinterpret_cast<void **>(&s));
	return s;
}

IAIMPString *ItemTitleOrFileName(const PlaylistItemContext &ctx)
{
	IAIMPString *title = ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_TITLE);
	if (title && title->GetLength() > 0)
		return title;
	if (title)
		title->Release();
	return ItemFileName(ctx);
}

bool PlaylistItemMatches(const PlaylistItemContext &ctx, IAIMPString *searchString)
{
	const auto matches = [&](IAIMPString *s)
	{
		if (!s)
			return false;
		INT32 index = -1;
		const bool found = Succeeded(s->Find(searchString, &index, AIMP_STRING_FIND_IGNORECASE, 0)) && index >= 0;
		s->Release();
		return found;
	};
	return matches(ItemTitleOrFileName(ctx)) ||
		   matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST)) ||
		   matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM)) ||
		   matches(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_GENRE)) ||
		   matches(ItemParentDirName(ctx));
}
