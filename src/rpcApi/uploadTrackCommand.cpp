#include "uploadTrackCommand.h"

#include <cstdint>
#include <filesystem>
#include <string>
#include <vector>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "helpers/idLookup.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "player/uploads.h"
#include "settings.h"
#include "utf8Path.h"

namespace
{
	std::string TagBasedName(IAIMPCore *core, const std::string &fileUtf8)
	{
		std::string artist, title;
		IAIMPServiceFileInfo *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceFileInfo, reinterpret_cast<void **>(&service))) && service)
		{
			IAIMPFileInfo *info = nullptr;
			IAIMPString *uri = StringToIAIMPString(core, fileUtf8);
			if (uri && Succeeded(core->CreateObject(IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))) && info)
			{
				if (Succeeded(service->GetFileInfoFromFileURI(uri, 0, info)))
				{
					artist = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ARTIST);
					title = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_TITLE);
				}
				info->Release();
			}
			if (uri)
				uri->Release();
			service->Release();
		}
		if (title.empty())
			return {};
		return player::SanitizeFileName(artist.empty() ? title : artist + " - " + title);
	}

	// The app sends the name with every character outside ISO-8859-1 replaced by a
	// question mark; the tags name the file better than that.
	std::string RestoreName(IAIMPCore *core, const std::string &savedUtf8)
	{
		const std::filesystem::path saved = PathFromUtf8(savedUtf8);
		const std::string tagName = RunOnMainThread(core, [&]
													{ return TagBasedName(core, savedUtf8); });
		if (tagName.empty())
			return savedUtf8;
		const std::filesystem::path target = player::UniqueTarget(saved.parent_path(), PathFromUtf8(tagName + PathToUtf8(saved.extension())));
		std::error_code ec;
		std::filesystem::rename(saved, target, ec);
		return ec ? savedUtf8 : PathToUtf8(target);
	}
}

void rpcapi::UploadTrackCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapUpload(R"(/uploadTrack/playlist_id/(-?\d+))",
				  [core = FCore, &idManager = FIdManager, &settings = FSettings](const std::vector<std::string> &matches, const std::vector<HttpUploadedFile> &files) -> int
				  {
					  const Settings::FeatureSettings features = settings.Get().Features;
					  if (!features.UploadTracks)
						  return 403;
					  if (matches.empty() || files.empty())
						  return 400;
					  const std::int32_t playlistId = static_cast<std::int32_t>(std::stol(matches[0]));
					  const bool playlistExists = RunOnMainThread(core, [&]
																  {
						  IAIMPPlaylist *playlist = FindPlaylist(core, idManager, playlistId);
						  if (playlist)
							  playlist->Release();
						  return playlist != nullptr; });
					  if (!playlistExists)
						  return 404;

					  std::vector<player::UploadedFile> uploads;
					  for (const HttpUploadedFile &file : files)
						  uploads.push_back({file.FileName.empty() ? file.Name : file.FileName, file.Content});
					  player::SavedUploads saved = player::SaveUploads(features.EffectiveUploadFolder(), uploads);
					  if (saved.Failure != player::UploadFailure::None)
						  return 500;
					  for (std::size_t i = 0; i < saved.Paths.size(); ++i)
						  if (uploads[i].Name.find('?') != std::string::npos)
							  saved.Paths[i] = RestoreName(core, saved.Paths[i]);

					  const HRESULT result = RunOnMainThread(core, [&]
															 { return AddFilesByPlaylistId(core, idManager, playlistId, saved.Paths); });
					  return result == E_INVALIDARG ? 404 : (Failed(result) ? 500 : 200);
				  });
}
