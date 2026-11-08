#include "trackFile.h"

#include <cctype>
#include <cstdint>

#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playlistItemContext.h"
#include "playlists.h"

std::string player::AudioSourceFile(IAIMPCore *core, const std::string &fileUri)
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

std::string player::TrackFile(IAIMPCore *core, IAIMPPlaylistItem *item)
{
	std::string file;
	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	{
		const PlaylistItemContext ctx(fileUriService, item);
		if (ctx.FileUri && !ItemIsUrl(ctx))
		{
			const std::string fileUri = IAIMPStringToString(ctx.FileUri);
			file = ItemInContainer(ctx) ? AudioSourceFile(core, fileUri) : fileUri;
		}
	}
	if (fileUriService)
		fileUriService->Release();
	return file;
}

player::MutationResult player::FindTrackFile(IAIMPCore *core, const std::string &playlistId, const std::string &fileUri, std::string &file)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	std::int32_t index = 0;
	IAIMPPlaylistItem *item = FindItemByUri(playlist, fileUri, index);
	playlist->Release();
	if (!item)
		return MutationResult::ItemNotFound;
	file = TrackFile(core, item);
	item->Release();
	return MutationResult::Ok;
}

std::string player::AudioContentType(const std::filesystem::path &file)
{
	std::string ext = file.extension().generic_string();
	for (char &c : ext)
		c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
	if (ext == ".mp3")
		return "audio/mpeg";
	if (ext == ".flac")
		return "audio/flac";
	if (ext == ".ogg" || ext == ".oga" || ext == ".opus")
		return "audio/ogg";
	if (ext == ".m4a" || ext == ".mp4" || ext == ".aac")
		return "audio/mp4";
	if (ext == ".wav")
		return "audio/wav";
	if (ext == ".wma")
		return "audio/x-ms-wma";
	if (ext == ".ape")
		return "audio/x-ape";
	return "application/octet-stream";
}

IAIMPFileInfo *player::ReadFileInfo(IAIMPCore *core, const std::string &fileUri)
{
	IAIMPServiceFileInfo *service = AcquireService<IAIMPServiceFileInfo>(core, IID_IAIMPServiceFileInfo);
	IAIMPString *uri = StringToIAIMPString(core, fileUri);
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
