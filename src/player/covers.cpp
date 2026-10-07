#include "covers.h"

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "md5.h"
#include "playlistItemContext.h"

namespace
{
	// The player's own file info while it plays `fileName`: for a stream it names
	// the station's current track.
	IAIMPFileInfo *PlayingFileInfoFor(IAIMPCore *core, const std::string &fileName)
	{
		IAIMPServicePlayer *player = AcquireService<IAIMPServicePlayer>(core, IID_IAIMPServicePlayer);
		if (!player)
			return nullptr;
		IAIMPFileInfo *info = nullptr;
		if (Succeeded(player->GetInfo(&info)) && info && GetPropertyAsString(info, AIMP_FILEINFO_PROPID_FILENAME) != fileName)
		{
			info->Release();
			info = nullptr;
		}
		player->Release();
		return info;
	}

	IAIMPFileInfo *ReadFileInfo(IAIMPCore *core, const std::string &fileName)
	{
		IAIMPServiceFileInfo *service = AcquireService<IAIMPServiceFileInfo>(core, IID_IAIMPServiceFileInfo);
		IAIMPString *uri = StringToIAIMPString(core, fileName);
		IAIMPFileInfo *info = nullptr;
		if (service && uri && Succeeded(core->CreateObject(IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))) && info &&
			Failed(service->GetFileInfoFromFileURI(uri, 0, info)))
		{
			info->Release();
			info = nullptr;
		}
		if (uri)
			uri->Release();
		if (service)
			service->Release();
		return info;
	}

	IAIMPFileInfo *StreamFileInfo(IAIMPCore *core, const player::CoverSource &source)
	{
		IAIMPFileInfo *info = nullptr;
		if (Failed(core->CreateObject(IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))) || !info)
			return nullptr;
		const auto set = [&](int propId, const std::string &value)
		{
			if (IAIMPString *s = StringToIAIMPString(core, value))
			{
				info->SetValueAsObject(propId, s);
				s->Release();
			}
		};
		set(AIMP_FILEINFO_PROPID_FILENAME, source.FileName);
		set(AIMP_FILEINFO_PROPID_ARTIST, source.Artist);
		set(AIMP_FILEINFO_PROPID_ALBUM, source.Album);
		return info;
	}
}

player::CoverSource player::DescribeCoverSource(IAIMPFileInfo *info, bool isUrl)
{
	CoverSource source;
	source.FileName = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_FILENAME);
	INT64 size = 0;
	info->GetValueAsInt64(AIMP_FILEINFO_PROPID_FILESIZE, &size);
	source.FileSize = size;
	source.IsUrl = isUrl;
	if (isUrl)
	{
		source.Artist = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ARTIST);
		source.Album = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ALBUM);
	}
	return source;
}

std::string player::CoverKey(const CoverSource &source)
{
	return Md5Hex(source.FileName + '\n' + std::to_string(source.FileSize) + '\n' + source.Artist + '\n' + source.Album)
		.substr(0, 16);
}

player::MutationResult player::GetCoverTarget(IAIMPCore *core, const std::string &playlistId, std::int32_t index, CoverTarget &target)
{
	IAIMPPlaylistItem *item = nullptr;
	const MutationResult found = FindPlaylistItem(core, playlistId, index, item);
	if (found != MutationResult::Ok)
		return found;

	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	IAIMPFileInfo *info = nullptr;
	{
		const PlaylistItemContext ctx(fileUriService, item);
		const bool isUrl = fileUriService && ctx.FileUri && fileUriService->IsURL(ctx.FileUri) == S_OK;
		if (isUrl && ctx.FileUri)
			info = PlayingFileInfoFor(core, IAIMPStringToString(ctx.FileUri));
		if (!info && ctx.FileInfo)
		{
			info = ctx.FileInfo;
			info->AddRef();
		}
		if (info)
			target.Source = DescribeCoverSource(info, isUrl);
	}
	if (fileUriService)
		fileUriService->Release();
	item->Release();
	if (!info)
		return MutationResult::ItemNotFound;
	target.FileInfo = info;
	return MutationResult::Ok;
}

IAIMPFileInfo *player::ResolveCoverFileInfo(IAIMPCore *core, const CoverSource &source)
{
	if (IAIMPFileInfo *playing = PlayingFileInfoFor(core, source.FileName))
		return playing;
	return source.IsUrl ? StreamFileInfo(core, source) : ReadFileInfo(core, source.FileName);
}
