#include "downloadTrackCommand.h"

#include <cstdint>
#include <filesystem>
#include <string>
#include <system_error>

#include "apiPlaylists.h"
#include "helpers/idLookup.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "parseInt32.h"
#include "player/trackFile.h"
#include "settings.h"
#include "utf8Path.h"

void rpcapi::DownloadTrackCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapGet(R"(/downloadTrack/playlist_id/-?\d+/track_id/(-?\d+))",
			   [core = FCore, &idManager = FIdManager, &settings = FSettings](const ApiRequest &request) -> std::optional<HttpContent>
			   {
				   const std::optional<std::int32_t> trackId = ParseInt32(request.PathMatches.at(0));
				   if (!trackId)
					   return std::nullopt;
				   const std::string file = RunOnMainThread(core, [&]() -> std::string
															{
					   IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, *trackId);
					   if (!item)
						   return {};
					   std::string result = player::TrackFile(core, item);
					   item->Release();
					   return result; });
				   const std::filesystem::path path = PathFromUtf8(file);
				   std::error_code ec;
				   if (!std::filesystem::is_regular_file(path, ec))
					   return std::nullopt;

				   HttpContent content;
				   // Raw UTF-8 in the quotes and no filename*, as the original plugin sent it: the
				   // app's download manager crashes on a percent-encoded name. Not the web API's
				   // header, which is built to the standard. Sent with a refusal too: the app
				   // reads the name before it downloads, and falls over without the header.
				   content.Headers["Content-Disposition"] = "attachment; filename=\"" + PathToUtf8(path.filename()) + "\"";
				   if (!settings.Get().Features.DownloadTracks)
				   {
					   content.Status = 403;
					   return content;
				   }
				   content.ContentType = player::AudioContentType(path);
				   content.FilePath = file;
				   return content;
			   });
}
