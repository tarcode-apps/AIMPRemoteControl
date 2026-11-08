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
#include "parseInt32.h"
#include "player/trackFile.h"
#include "player/uploads.h"
#include "settings.h"
#include "utf8Path.h"

namespace
{
	std::string TagBasedName(IAIMPCore *core, const std::string &fileUtf8)
	{
		std::string artist, title;
		if (IAIMPFileInfo *info = player::ReadFileInfo(core, fileUtf8))
		{
			artist = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ARTIST);
			title = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_TITLE);
			info->Release();
		}
		if (title.empty())
			return {};
		return artist.empty() ? title : artist + " - " + title;
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
		// The extension is part of what is cleaned: "NUL.mp3" is a device on Windows.
		const std::string name = player::SanitizeFileName(tagName + PathToUtf8(saved.extension()));
		// The file is moved over an empty one created for it, so that it never
		// replaces a file another upload gave the same name.
		const std::filesystem::path target = player::CreateUniqueFile(saved.parent_path(), PathFromUtf8(name));
		if (target.empty())
			return savedUtf8;
		std::error_code ec;
		std::filesystem::rename(saved, target, ec);
		if (!ec)
			return PathToUtf8(target);
		std::filesystem::remove(target, ec);
		return savedUtf8;
	}
}

void rpcapi::UploadTrackCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapUpload(R"(/uploadTrack/playlist_id/(-?\d+))",
				  [core = FCore, &idManager = FIdManager, &settings = FSettings](const std::vector<std::string> &matches, IUploadBody &body) -> int
				  {
					  const Settings::FeatureSettings features = settings.Get().Features;
					  if (!features.UploadTracks)
						  return 403;
					  const std::optional<std::int32_t> playlistId = matches.empty() ? std::nullopt : ParseInt32(matches[0]);
					  if (!playlistId)
						  return 400;
					  const bool playlistExists = RunOnMainThread(core, [&]
																  {
						  IAIMPPlaylist *playlist = FindPlaylist(core, idManager, *playlistId);
						  if (playlist)
							  playlist->Release();
						  return playlist != nullptr; });
					  if (!playlistExists)
						  return 404;

					  player::UploadWriter writer(features.EffectiveUploadFolder());
					  if (!writer.Ready() || !writer.HasRoomFor(body.DeclaredSize()))
						  return 500;
					  std::vector<std::string> names;
					  const bool whole = body.ReadFiles([&](const UploadPart &part)
														{
															names.push_back(part.FileName);
															return writer.Begin(part.FileName); },
														[&](const char *data, std::size_t size)
														{ return writer.Write(data, size); });
					  player::SavedUploads saved = writer.Finish();
					  if (saved.Failure != player::UploadFailure::None || !whole || saved.Paths.empty())
					  {
						  writer.Abandon();
						  return saved.Failure == player::UploadFailure::None || saved.Failure == player::UploadFailure::InvalidName ? 400 : 500;
					  }
					  for (std::size_t i = 0; i < saved.Paths.size(); ++i)
						  if (names[i].find('?') != std::string::npos)
							  saved.Paths[i] = RestoreName(core, saved.Paths[i]);

					  const HRESULT result = RunOnMainThread(core, [&]
															 { return AddFilesByPlaylistId(core, idManager, *playlistId, saved.Paths); });
					  if (Succeeded(result))
						  return 200;
					  // A renamed file is no longer where the writer put it.
					  std::error_code ec;
					  for (const std::string &path : saved.Paths)
						  std::filesystem::remove(PathFromUtf8(path), ec);
					  writer.Abandon();
					  return result == E_INVALIDARG ? 404 : 500;
				  });
}
