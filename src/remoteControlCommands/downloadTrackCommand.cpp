#include "downloadTrackCommand.h"

#include <cctype>
#include <cstdint>
#include <filesystem>
#include <string>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	std::string ContentTypeFor(const std::filesystem::path &file)
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

	std::string LocalFileName(IAIMPCore *core, RemoteControlIdManager &idManager, std::int32_t trackId)
	{
		return RunOnMainThread(core, [&]() -> std::string
							   {
			IAIMPPlaylistItem *item = FindPlaylistItem(core, idManager, trackId);
			if (!item)
				return {};
			std::string result;
			IAIMPString *uri = nullptr;
			if (Succeeded(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString, reinterpret_cast<void **>(&uri))) && uri)
			{
				IAIMPServiceFileURI *fileUri = nullptr;
				if (Succeeded(core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUri))) && fileUri)
				{
					if (fileUri->IsURL(uri) != S_OK)
					{
						IAIMPString *container = nullptr, *part = nullptr;
						if (Succeeded(fileUri->Parse(uri, &container, &part)) && container)
						{
							result = IAIMPStringToString(container);
							container->Release();
							if (part)
								part->Release();
						}
						else
							result = IAIMPStringToString(uri);
					}
					fileUri->Release();
				}
				uri->Release();
			}
			item->Release();
			return result; });
	}
}

void DownloadTrackCommand::Register(IRpcRegistrar &rpc)
{
	rpc.AddGet(R"(/downloadTrack/playlist_id/-?\d+/track_id/(-?\d+))",
			   [core = FCore, &idManager = FIdManager](const std::vector<std::string> &matches) -> std::optional<HttpContent>
			   {
				   if (matches.empty())
					   return std::nullopt;
				   const std::string fileName = LocalFileName(core, idManager, static_cast<std::int32_t>(std::stol(matches[0])));
				   if (fileName.empty())
					   return std::nullopt;

				   const std::filesystem::path path(std::u8string(fileName.begin(), fileName.end()));
				   std::error_code ec;
				   if (!std::filesystem::is_regular_file(path, ec))
					   return std::nullopt;

				   const std::u8string u8name = path.filename().u8string();
				   const std::string name(u8name.begin(), u8name.end());
				   HttpContent content;
				   content.ContentType = ContentTypeFor(path);
				   content.FilePath = fileName;
				   content.Headers["Content-Disposition"] = "attachment; filename=\"" + name + "\"";
				   return content;
			   });
}
