#include "getCoverCommand.h"

#include <cstdint>
#include <optional>
#include <string>

#include <nlohmann/json.hpp>

#include "apiAlbumArt.h"
#include "apiCore.h"
#include "apiFileManager.h"
#include "apiObjects.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "crc32.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorCoverNotFound = 22;

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

	std::optional<HttpContent> EncodePng(IAIMPCore *core, IAIMPImage *image)
	{
		IAIMPMemoryStream *stream = nullptr;
		if (Failed(core->CreateObject(IID_IAIMPMemoryStream, reinterpret_cast<void **>(&stream))) || !stream)
			return std::nullopt;
		std::optional<HttpContent> result;
		if (Succeeded(image->SaveToStream(stream, AIMP_IMAGE_FORMAT_PNG)) && stream->GetSize() > 0)
			result = HttpContent{"image/png", std::string(static_cast<const char *>(stream->GetData()), static_cast<std::size_t>(stream->GetSize()))};
		stream->Release();
		return result;
	}

	std::optional<HttpContent> RawContent(IAIMPImageContainer *container)
	{
		SIZE size{};
		INT32 format = AIMP_IMAGE_FORMAT_UNKNOWN;
		container->GetInfo(&size, &format);
		const char *contentType = nullptr;
		switch (format)
		{
		case AIMP_IMAGE_FORMAT_JPG:
			contentType = "image/jpeg";
			break;
		case AIMP_IMAGE_FORMAT_PNG:
			contentType = "image/png";
			break;
		case AIMP_IMAGE_FORMAT_GIF:
			contentType = "image/gif";
			break;
		default:
			return std::nullopt;
		}
		if (container->GetDataSize() == 0)
			return std::nullopt;
		return HttpContent{contentType, std::string(reinterpret_cast<const char *>(container->GetData()), container->GetDataSize())};
	}

	struct CoverRequest
	{
		IAIMPCore *Core;
		std::optional<HttpContent> Result;
	};

	void WINAPI OnCoverReceived(IAIMPImage *image, IAIMPImageContainer *container, void *userData)
	{
		auto *request = static_cast<CoverRequest *>(userData);
		if (container)
			request->Result = RawContent(container);
		if (request->Result)
			return;

		IAIMPImage *owned = nullptr;
		if (!image && container && Succeeded(container->CreateImage(&owned)))
			image = owned;
		if (image)
			request->Result = EncodePng(request->Core, image);
		if (owned)
			owned->Release();
	}

	const char *ExtensionFor(const HttpContent &content)
	{
		if (content.ContentType == "image/jpeg")
			return "jpg";
		if (content.ContentType == "image/gif")
			return "gif";
		return "png";
	}

	std::optional<HttpContent> LoadCover(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId)
	{
		IAIMPFileInfo *fileInfo = TrackFileInfo(core, idManager, trackId);
		if (!fileInfo)
			return std::nullopt;

		CoverRequest request{core, std::nullopt};
		IAIMPServiceAlbumArt *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceAlbumArt, reinterpret_cast<void **>(&service))) && service)
		{
			TTaskHandle task = 0;
			service->Get2(fileInfo, AIMP_SERVICE_ALBUMART_FLAGS_ORIGINAL | AIMP_SERVICE_ALBUMART_FLAGS_WAITFOR,
						  OnCoverReceived, &request, &task);
			service->Release();
		}
		fileInfo->Release();
		return request.Result;
	}
}

void GetCoverCommand::Register(IRpcRegistrar &rpc)
{
	IAIMPCore *core = FCore;
	RemoteControlIdManager &idManager = FIdManager;

	rpc.Add("GetCover", [core, &idManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		const std::optional<HttpContent> cover = LoadCover(core, idManager, trackId);
		if (!cover)
			throw LocalizedRpcError(ErrorCoverNotFound, "coverNotFound");

		const std::uint32_t crc = Crc32Update(0, cover->Body.data(), cover->Body.size());
		return {{"album_cover_uri", "album_covers_cache/cover_0_" + std::to_string(trackId) + "_0x0_" + std::to_string(crc % 100000) + "." + ExtensionFor(*cover)}}; });

	rpc.AddGet(R"(/album_covers_cache/cover_0_(\d+)_\d+x\d+_\d+\.(?:png|jpg|gif))",
			   [core, &idManager](const std::vector<std::string> &matches) -> std::optional<HttpContent>
			   {
				   if (matches.empty())
					   return std::nullopt;
				   return LoadCover(core, idManager, static_cast<std::int32_t>(std::stol(matches[0])));
			   });
}
