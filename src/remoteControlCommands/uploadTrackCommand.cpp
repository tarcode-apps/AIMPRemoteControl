#include "uploadTrackCommand.h"

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>
#include <string_view>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <shlwapi.h>
#endif

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"
#include "settings.h"

namespace
{
	std::filesystem::path FromUtf8(const std::string &utf8)
	{
		return std::filesystem::path(std::u8string(utf8.begin(), utf8.end()));
	}

	std::string ToUtf8(const std::filesystem::path &path)
	{
		const std::u8string u8 = path.u8string();
		return std::string(u8.begin(), u8.end());
	}

	std::string SanitizeFileName(const std::string &utf8)
	{
#ifdef _WIN32
		std::wstring wide = FromUtf8(utf8).wstring();
		for (wchar_t &c : wide)
		{
			const UINT type = PathGetCharTypeW(c);
			if (c == L'\0' || type == GCT_INVALID || (type & (GCT_WILD | GCT_SEPARATOR)))
				c = L'_';
		}
		return ToUtf8(std::filesystem::path(wide));
#else
		std::string name = utf8;
		for (char &c : name)
			if (c == '/' || c == '\0')
				c = '_';
		return name;
#endif
	}

	std::filesystem::path UniqueTarget(const std::filesystem::path &folder, const std::filesystem::path &name)
	{
		std::filesystem::path target = folder / name;
		std::error_code ec;
		for (int n = 2; std::filesystem::exists(target, ec); ++n)
		{
			std::filesystem::path numbered = name.stem();
			numbered += " (" + std::to_string(n) + ")";
			numbered += name.extension();
			target = folder / numbered;
		}
		return target;
	}

	std::filesystem::path ClientFileName(const std::string &clientFileName)
	{
		std::filesystem::path name = FromUtf8(SanitizeFileName(clientFileName)).filename();
		if (name.empty() || name == "." || name == "..")
			name = "track";
		return name;
	}

	bool WriteFile(const std::filesystem::path &target, std::string_view content)
	{
		std::ofstream out(target, std::ios::binary | std::ios::trunc);
		return out && out.write(content.data(), static_cast<std::streamsize>(content.size()));
	}

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
		return SanitizeFileName(artist.empty() ? title : artist + " - " + title);
	}

	std::filesystem::path RestoreName(IAIMPCore *core, const std::filesystem::path &folder, const std::filesystem::path &saved)
	{
		const std::string tagName = RunOnMainThread(core, [&]
													{ return TagBasedName(core, ToUtf8(saved)); });
		if (tagName.empty())
			return saved;
		const std::filesystem::path target = UniqueTarget(folder, FromUtf8(tagName + ToUtf8(saved.extension())));
		std::error_code ec;
		std::filesystem::rename(saved, target, ec);
		return ec ? saved : target;
	}
}

void UploadTrackCommand::Register(IRpcRegistrar &rpc)
{
	rpc.AddUpload(R"(/uploadTrack/playlist_id/(-?\d+))",
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

					  const std::filesystem::path folder = FromUtf8(features.EffectiveUploadFolder());
					  std::error_code ec;
					  std::filesystem::create_directories(folder, ec);

					  std::vector<std::string> saved;
					  for (const HttpUploadedFile &file : files)
					  {
						  const std::string clientName = file.FileName.empty() ? file.Name : file.FileName;
						  std::filesystem::path target = UniqueTarget(folder, ClientFileName(clientName));
						  if (!WriteFile(target, file.Content))
							  return 500;
						  if (clientName.find('?') != std::string::npos)
							  target = RestoreName(core, folder, target);
						  saved.push_back(ToUtf8(target));
					  }

					  const HRESULT result = RunOnMainThread(core, [&]
															 { return AddFilesToPlaylist(core, idManager, playlistId, saved); });
					  return result == E_INVALIDARG ? 404 : (Failed(result) ? 500 : 200);
				  });
}
