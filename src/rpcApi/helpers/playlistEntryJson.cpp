#include "playlistEntryJson.h"

#include <cmath>
#include <filesystem>

#include "aimpHelper.h"

namespace
{
	std::int32_t FileInfoInt32(const PlaylistItemContext &ctx, int propId)
	{
		INT32 value = 0;
		if (ctx.FileInfo)
			ctx.FileInfo->GetValueAsInt32(propId, &value);
		return value;
	}
}

nlohmann::json PlaylistEntryField(const std::string &field, const PlaylistItemContext &ctx, const PlaylistEntryIds &ids)
{
	if (field == "id")
		return ids.EntryId;
	if (field == "playlist_id")
		return ids.PlaylistId;
	if (field == "queue_index")
		return ids.QueueIndex;
	if (field == "title")
	{
		IAIMPString *title = ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_TITLE);
		if (title && title->GetLength() > 0)
			return ToStringAndRelease(title);
		if (title)
			title->Release();
		return std::filesystem::path(ToStringAndRelease(ItemFileName(ctx))).stem().generic_string();
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
		return ToStringAndRelease(ItemParentDirName(ctx));
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
