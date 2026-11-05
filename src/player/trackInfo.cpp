#include "trackInfo.h"

#include <cctype>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "covers.h"
#include "playlistItemContext.h"

namespace
{
	// The extension of the file the tags name, upper-case without the dot, as the
	// player labels a format its tags do not name.
	std::string FileExtension(IAIMPCore *core, IAIMPServiceFileURI *fileUriService, const std::string &fileName)
	{
		std::string extension;
		IAIMPString *name = StringToIAIMPString(core, fileName);
		IAIMPString *ext = nullptr;
		if (fileUriService && name && Succeeded(fileUriService->ExtractFileExt(name, &ext, 0)) && ext)
			extension = ToStringAndRelease(ext);
		if (name)
			name->Release();
		if (!extension.empty() && extension.front() == '.')
			extension.erase(0, 1);
		for (char &c : extension)
			c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
		return extension;
	}

	// The audio file behind a part of a container: for a CUE sheet, the file the
	// sheet names, which the player labels the part's format with.
	std::string AudioSourceFile(IAIMPCore *core, const std::string &fileUri)
	{
		std::string source;
		IAIMPServiceFileInfo *service = AcquireService<IAIMPServiceFileInfo>(core, IID_IAIMPServiceFileInfo);
		IAIMPString *uri = StringToIAIMPString(core, fileUri);
		IAIMPVirtualFile *virtualFile = nullptr;
		if (service && uri && Succeeded(service->GetVirtualFile(uri, 0, &virtualFile)) && virtualFile)
		{
			source = GetPropertyAsString(virtualFile, AIMP_VIRTUALFILE_PROPID_AUDIOSOURCEFILE);
			virtualFile->Release();
		}
		if (uri)
			uri->Release();
		if (service)
			service->Release();
		return source;
	}

	// A field from the file's tags, or from the playlist's copy when the file gave none.
	class Fields
	{
	public:
		Fields(IAIMPFileInfo *file, IAIMPFileInfo *cached) : FFile(file), FCached(cached) {}

		std::string Text(int propId) const
		{
			std::string value = GetPropertyAsString(FFile, propId);
			return value.empty() ? GetPropertyAsString(FCached, propId) : value;
		}

		std::int32_t Int(int propId) const
		{
			INT32 value = 0;
			if (FFile)
				FFile->GetValueAsInt32(propId, &value);
			if (!value && FCached)
				FCached->GetValueAsInt32(propId, &value);
			return value;
		}

		std::int64_t Int64(int propId) const
		{
			INT64 value = 0;
			if (FFile)
				FFile->GetValueAsInt64(propId, &value);
			if (!value && FCached)
				FCached->GetValueAsInt64(propId, &value);
			return value;
		}

		double Float(int propId) const
		{
			DOUBLE value = 0;
			if (FFile)
				FFile->GetValueAsFloat(propId, &value);
			if (!value && FCached)
				FCached->GetValueAsFloat(propId, &value);
			return value;
		}

	private:
		IAIMPFileInfo *const FFile;
		IAIMPFileInfo *const FCached;
	};
}

player::MutationResult player::ReadTrackInfo(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, TrackInfo &info)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	IAIMPPlaylistItem *item = FindItemByUri(playlist, fileUri, info.Index);
	playlist->Release();
	if (!item)
		return MutationResult::ItemNotFound;

	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	{
		const PlaylistItemContext ctx(fileUriService, item);
		info.FileUri = fileUri;
		info.FileName = ToStringAndRelease(ItemFileName(ctx));
		info.IsUrl = ItemIsUrl(ctx);
		info.InContainer = ItemInContainer(ctx);
		if (ctx.FileInfo)
			info.Cover = DescribeCoverSource(ctx.FileInfo, info.IsUrl);

		// A stream has no file to read; the playlist's copy is what there is.
		IAIMPFileInfo *file = info.IsUrl ? nullptr : ReadFileInfo(core, fileUri);
		const Fields fields(file, ctx.FileInfo);
		info.Title = fields.Text(AIMP_FILEINFO_PROPID_TITLE);
		info.Artist = fields.Text(AIMP_FILEINFO_PROPID_ARTIST);
		info.Album = fields.Text(AIMP_FILEINFO_PROPID_ALBUM);
		info.AlbumArtist = fields.Text(AIMP_FILEINFO_PROPID_ALBUMARTIST);
		info.Genre = fields.Text(AIMP_FILEINFO_PROPID_GENRE);
		info.Year = fields.Text(AIMP_FILEINFO_PROPID_DATE);
		info.TrackNumber = fields.Text(AIMP_FILEINFO_PROPID_TRACKNUMBER);
		info.Lyricist = fields.Text(AIMP_FILEINFO_PROPID_LYRICIST);
		info.Format = fields.Text(AIMP_FILEINFO_PROPID_CODEC);
		// A stream's address has no extension worth the name.
		if (info.Format.empty() && !info.IsUrl)
		{
			const std::string audioFile = info.InContainer ? AudioSourceFile(core, fileUri) : std::string();
			info.Format = FileExtension(core, fileUriService,
										audioFile.empty() ? fields.Text(AIMP_FILEINFO_PROPID_FILENAME) : audioFile);
		}
		info.SampleRate = fields.Int(AIMP_FILEINFO_PROPID_SAMPLERATE);
		info.Bitrate = fields.Int(AIMP_FILEINFO_PROPID_BITRATE);
		info.BitDepth = fields.Int(AIMP_FILEINFO_PROPID_BITDEPTH);
		info.Channels = fields.Int(AIMP_FILEINFO_PROPID_CHANNELS);
		info.Duration = fields.Float(AIMP_FILEINFO_PROPID_DURATION);
		info.Size = fields.Int64(AIMP_FILEINFO_PROPID_FILESIZE);
		// The statistics are the player's, not the file's.
		if (ctx.FileInfo)
		{
			INT32 playCount = 0;
			ctx.FileInfo->GetValueAsInt32(AIMP_FILEINFO_PROPID_ML_PLAYCOUNT, &playCount);
			info.PlayCount = playCount;
			DOUBLE lastPlayed = 0;
			ctx.FileInfo->GetValueAsFloat(AIMP_FILEINFO_PROPID_ML_LASTPLAYDATE, &lastPlayed);
			info.LastPlayed = lastPlayed;
		}
		if (file)
			file->Release();
	}
	if (fileUriService)
		fileUriService->Release();
	item->Release();
	return MutationResult::Ok;
}
