#include "getPlaylistEntryInfoCommand.h"

#include <cstdint>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "playlistEntryJson.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorTrackNotFound = 21;

	const char *const InfoFields[] = {"album", "artist", "bitrate", "channels_count", "date", "duration", "filesize",
									  "genre", "id", "playlist_id", "rating", "samplerate", "title"};
}

void GetPlaylistEntryInfoCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetPlaylistEntryInfo", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		const nlohmann::json result = RunOnMainThread(core, [&]() -> nlohmann::json
		{
			IAIMPPlaylist *playlist = nullptr;
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId, &playlist);
			if (!item)
				return nullptr;

			IAIMPServiceFileURI *fileUriService = nullptr;
			core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService));

			nlohmann::json info = nlohmann::json::object();
			{
				const PlaylistEntryContext ctx(fileUriService, item, trackId,
											   idManager.PlaylistGetOrGeneratePluginId(GetPlaylistAIMPId(playlist)));
				for (const char *field : InfoFields)
					info[field] = PlaylistEntryField(field, ctx);
			}

			if (fileUriService)
				fileUriService->Release();
			item->Release();
			playlist->Release();
			return info;
		});

		if (result.is_null())
			throw RpcError(ErrorTrackNotFound, "Getting info about track failed. Reason: track not found.");
		return result; });
}
