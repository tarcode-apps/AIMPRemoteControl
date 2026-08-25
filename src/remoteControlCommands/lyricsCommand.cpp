#include "lyricsCommand.h"

#include <cstdint>
#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiLyrics.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	constexpr int ErrorLyricsNotAvailable = 35;

	std::string LyricsFromTags(IAIMPCore *core, IAIMPPlaylistItem *item)
	{
		std::string text;
		IAIMPFileInfo *info = nullptr;
		if (Succeeded(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))) && info)
		{
			text = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_LYRICS);
			info->Release();
		}
		if (!text.empty())
			return text;

		IAIMPString *uri = nullptr;
		if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString, reinterpret_cast<void **>(&uri))) || !uri)
			return text;
		IAIMPServiceFileInfo *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceFileInfo, reinterpret_cast<void **>(&service))) && service)
		{
			IAIMPFileInfo *full = nullptr;
			if (Succeeded(core->CreateObject(IID_IAIMPFileInfo, reinterpret_cast<void **>(&full))) && full)
			{
				if (Succeeded(service->GetFileInfoFromFileURI(uri, 0, full)))
					text = GetPropertyAsString(full, AIMP_FILEINFO_PROPID_LYRICS);
				full->Release();
			}
			service->Release();
		}
		uri->Release();
		return text;
	}

	void WINAPI OnLyricsReceived(IAIMPLyrics *lyrics, void *userData)
	{
		auto *text = static_cast<std::string *>(userData);
		IAIMPString *s = nullptr;
		if (lyrics && Succeeded(lyrics->SaveToString(&s, AIMP_LYRICS_FORMAT_TXT)) && s)
		{
			*text = IAIMPStringToString(s);
			s->Release();
		}
	}

	std::string LyricsFromService(IAIMPCore *core, IAIMPFileInfo *fileInfo)
	{
		std::string text;
		IAIMPServiceLyrics *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceLyrics, reinterpret_cast<void **>(&service))) && service)
		{
			TTaskHandle task = 0;
			service->Get(fileInfo, AIMP_SERVICE_LYRICS_FLAGS_WAITFOR, OnLyricsReceived, &text, &task);
			service->Release();
		}
		return text;
	}
}

void LyricsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Lyrics", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("track_id") || !params["track_id"].is_number_integer())
			throw RpcError(-32602, "track_id is required");
		const std::int32_t trackId = params["track_id"].get<std::int32_t>();

		std::string text;
		IAIMPFileInfo *fileInfo = RunOnMainThread(core, [&]() -> IAIMPFileInfo *
		{
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return nullptr;
			text = LyricsFromTags(core, item);
			IAIMPFileInfo *info = nullptr;
			if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILEINFO, IID_IAIMPFileInfo, reinterpret_cast<void **>(&info))))
				info = nullptr;
			item->Release();
			return info;
		});
		if (fileInfo)
		{
			if (text.empty())
				text = LyricsFromService(core, fileInfo);
			fileInfo->Release();
		}

		if (text.empty())
			throw RpcError(ErrorLyricsNotAvailable, "Lyrics not available");
		return {{"text", text}}; });
}
