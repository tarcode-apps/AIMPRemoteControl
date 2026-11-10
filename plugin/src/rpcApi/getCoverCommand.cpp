#include "getCoverCommand.h"

#include "apiErrors.h"

#include <cstdint>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "player/albumArt.h"
#include "helpers/legacyErrors.h"
#include "helpers/idLookup.h"
#include "crc32.h"
#include "mainThreadRunner.h"
#include "helpers/remoteControlIdManager.h"
#include "parseInt32.h"

namespace
{
	IAIMPFileInfo *TrackFileInfo(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId)
	{
		return RunOnMainThread(core, [&]() -> IAIMPFileInfo *
							   {
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return nullptr;
			IAIMPFileInfo *fileInfo = nullptr;
			if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&fileInfo))))
				fileInfo = nullptr;
			item->Release();
			return fileInfo; });
	}

	const char *ExtensionFor(const player::CoverImage &cover)
	{
		if (cover.ContentType == "image/jpeg")
			return "jpg";
		if (cover.ContentType == "image/gif")
			return "gif";
		return "png";
	}

	// The original image, as the original plugin sent it.
	std::optional<player::CoverImage> LoadCover(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId)
	{
		IAIMPFileInfo *fileInfo = TrackFileInfo(core, idManager, trackId);
		if (!fileInfo)
			return std::nullopt;
		std::optional<player::CoverImage> cover = player::LoadCover(core, fileInfo, player::CoverOriginal);
		fileInfo->Release();
		return cover;
	}
}

void rpcapi::GetCoverCommand::Register(IEndpointRouteBuilder &endpoints)
{
	IAIMPCore *core = FCore;
	RemoteControlIdManager &idManager = FIdManager;

	endpoints.MapRpc("GetCover", [core, &idManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		const std::optional<player::CoverImage> cover = LoadCover(core, idManager, trackId);
		if (!cover)
			throw LocalizedRpcError(ErrorCoverNotFound, "coverNotFound");

		const std::uint32_t crc = Crc32Update(0, cover->Body.data(), cover->Body.size());
		return {{"album_cover_uri", "album_covers_cache/cover_0_" + std::to_string(trackId) + "_0x0_" + std::to_string(crc % 100000) + "." + ExtensionFor(*cover)}}; });

	endpoints.MapGet(R"(/album_covers_cache/cover_0_(\d+)_\d+x\d+_\d+\.(?:png|jpg|gif))",
			   [core, &idManager](const ApiRequest &request) -> std::optional<HttpContent>
			   {
				   const std::optional<std::int32_t> trackId = ParseInt32(request.PathMatches.at(0));
				   if (!trackId)
					   return std::nullopt;
				   std::optional<player::CoverImage> cover = LoadCover(core, idManager, *trackId);
				   if (!cover)
					   return std::nullopt;
				   HttpContent content;
				   content.ContentType = cover->ContentType;
				   content.Body = std::move(cover->Body);
				   return content;
			   });
}
