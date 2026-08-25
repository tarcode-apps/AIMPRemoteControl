#include "playlistEntryJson.h"

#include <cmath>
#include <filesystem>

#include "aimpHelper.h"

namespace
{
	IAIMPString *ParentDirName(const PlaylistEntryContext &ctx)
	{
		IAIMPString *value = nullptr;
		if (ctx.FileUriService && ctx.FileUri &&
			Failed(ctx.FileUriService->ExtractFileParentDirName(ctx.FileUri, &value)))
			value = nullptr;
		return value;
	}

	IAIMPString *FileName(const PlaylistEntryContext &ctx)
	{
		IAIMPString *value = nullptr;
		if (ctx.FileUriService && ctx.FileUri &&
			Failed(ctx.FileUriService->ExtractFileName(ctx.FileUri, reinterpret_cast<IAIMPString *>(&value))))
			value = nullptr;
		return value;
	}

	std::string ToStringAndRelease(IAIMPString *s)
	{
		if (!s)
			return {};
		std::string result = IAIMPStringToString(s);
		s->Release();
		return result;
	}

	IAIMPString *TitleOrFileName(const PlaylistEntryContext &ctx)
	{
		IAIMPString *title = nullptr;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsObject(AIMP_FILEINFO_PROPID_TITLE, IID_IAIMPString, reinterpret_cast<void **>(&title));
		if (title && title->GetLength() > 0)
			return title;
		if (title)
			title->Release();
		return FileName(ctx);
	}

	std::int32_t FileInfoInt32(const PlaylistEntryContext &ctx, int propId)
	{
		INT32 value = 0;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsInt32(propId, &value);
		return value;
	}

	IAIMPString *FileInfoString(const PlaylistEntryContext &ctx, int propId)
	{
		IAIMPString *s = nullptr;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsObject(propId, IID_IAIMPString, reinterpret_cast<void **>(&s));
		return s;
	}
}

bool PlaylistEntryMatches(const PlaylistEntryContext &ctx, IAIMPString *searchString)
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
	return matches(TitleOrFileName(ctx)) ||
		   matches(FileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST)) ||
		   matches(FileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM)) ||
		   matches(FileInfoString(ctx, AIMP_FILEINFO_PROPID_GENRE)) ||
		   matches(ParentDirName(ctx));
}

PlaylistEntryContext::PlaylistEntryContext(IAIMPServiceFileURI *fileUriService, IAIMPPlaylistItem *item,
										   std::int32_t entryId, std::int32_t playlistId, std::int32_t queueIndex)
	: FileUriService(fileUriService), Item(item), EntryId(entryId), PlaylistId(playlistId), QueueIndex(queueIndex)
{
	if (!item)
		return;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&FileInfo))))
		FileInfo = nullptr;
	if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString, reinterpret_cast<void **>(&FileUri))))
		FileUri = nullptr;
}

PlaylistEntryContext::~PlaylistEntryContext()
{
	if (FileInfo)
		FileInfo->Release();
	if (FileUri)
		FileUri->Release();
}

nlohmann::json PlaylistEntryField(const std::string &field, const PlaylistEntryContext &ctx)
{
	if (field == "id")
		return ctx.EntryId;
	if (field == "playlist_id")
		return ctx.PlaylistId;
	if (field == "queue_index")
		return ctx.QueueIndex;
	if (field == "title")
	{
		IAIMPString *title = FileInfoString(ctx, AIMP_FILEINFO_PROPID_TITLE);
		if (title && title->GetLength() > 0)
			return ToStringAndRelease(title);
		if (title)
			title->Release();
		return std::filesystem::path(ToStringAndRelease(FileName(ctx))).stem().generic_string();
	}
	if (field == "artist")
		return GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_ARTIST);
	if (field == "album")
		return GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_ALBUM);
	if (field == "genre")
		return GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_GENRE);
	if (field == "filename")
		return IAIMPStringToString(ctx.FileUri);
	if (field == "foldername")
		return ToStringAndRelease(ParentDirName(ctx));
	if (field == "bitrate")
		return FileInfoInt32(ctx, AIMP_FILEINFO_PROPID_BITRATE);
	if (field == "channels_count")
		return FileInfoInt32(ctx, AIMP_FILEINFO_PROPID_CHANNELS);
	if (field == "samplerate")
		return FileInfoInt32(ctx, AIMP_FILEINFO_PROPID_SAMPLERATE);
	if (field == "date")
		return GetPropertyAsString(ctx.FileInfo, AIMP_FILEINFO_PROPID_DATE);
	if (field == "filesize")
	{
		INT64 size = 0;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsInt64(AIMP_FILEINFO_PROPID_FILESIZE, &size);
		return static_cast<std::int64_t>(size);
	}
	if (field == "duration")
	{
		DOUBLE seconds = 0.0;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_DURATION, &seconds);
		return static_cast<std::int64_t>(std::ceil(seconds)) * 1000; // whole seconds, rounded up like AIMP shows them
	}
	if (field == "rating")
	{
		DOUBLE mark = 0.0;
		if (ctx.Item)
			ctx.Item->GetValueAsFloat(AIMP_PLAYLISTITEM_PROPID_MARK, &mark);
		return mark;
	}
	if (field == "enabled")
	{
		INT32 enabled = 1;
		if (ctx.Item)
			ctx.Item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_PLAYINGSWITCH, &enabled);
		return enabled != 0;
	}
	return nullptr;
}
