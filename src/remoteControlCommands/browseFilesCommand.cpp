#include "browseFilesCommand.h"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>
#include "apiCore.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "settings.h"

#ifdef _WIN32
#include <windows.h>
#endif

namespace
{
	constexpr int ErrorPathInaccessible = 33;

	std::string ToUtf8(const std::filesystem::path &path)
	{
		const std::u8string u8 = path.u8string();
		return std::string(u8.begin(), u8.end());
	}

	std::filesystem::path FromUtf8(const std::string &utf8)
	{
		return std::filesystem::path(std::u8string(utf8.begin(), utf8.end()));
	}

	bool LessIgnoreCase(const std::string &a, const std::string &b)
	{
		return std::lexicographical_compare(a.begin(), a.end(), b.begin(), b.end(), [](unsigned char x, unsigned char y)
											{ return std::tolower(x) < std::tolower(y); });
	}

	bool IsHiddenOrSystemFile(const std::filesystem::path &path)
	{
#ifdef _WIN32
		const DWORD attributes = GetFileAttributesW(path.c_str());
		return attributes != INVALID_FILE_ATTRIBUTES && (attributes & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) != 0;
#else
		const std::string name = ToUtf8(path.filename());
		return !name.empty() && name[0] == '.';
#endif
	}

	nlohmann::json Roots()
	{
		nlohmann::json labels = nlohmann::json::array(), paths = nlohmann::json::array();
#ifdef _WIN32
		wchar_t buffer[512] = {};
		const DWORD length = GetLogicalDriveStringsW(static_cast<DWORD>(std::size(buffer) - 1), buffer);
		for (const wchar_t *drive = buffer; drive < buffer + length && *drive; drive += wcslen(drive) + 1)
		{
			wchar_t label[MAX_PATH + 1] = {};
			GetVolumeInformationW(drive, label, MAX_PATH, nullptr, nullptr, nullptr, nullptr, 0);
			labels.push_back(ToUtf8(std::filesystem::path(label)));
			paths.push_back(ToUtf8(std::filesystem::path(drive)));
		}
#else
		labels.push_back("");
		paths.push_back("/");
#endif
		return {{"labels", labels}, {"paths", paths}};
	}

	bool HasExtensionFrom(const std::filesystem::path &path, const std::vector<std::string> &extensions)
	{
		std::string ext = ToUtf8(path.extension());
		if (ext.empty())
			return false;
		ext.erase(0, 1); // leading dot
		for (char &c : ext)
			c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
		return std::find(extensions.begin(), extensions.end(), ext) != extensions.end();
	}

	nlohmann::json Listing(const std::string &pathUtf8, const std::vector<std::string> &extensions)
	{
		std::error_code ec;
		std::vector<std::string> files, folders;
		std::filesystem::directory_iterator it(FromUtf8(pathUtf8), std::filesystem::directory_options::skip_permission_denied, ec);
		if (ec)
			throw RpcError(ErrorPathInaccessible, "Path inaccessible");
		for (const auto &entry : it)
		{
			if (entry.is_directory(ec))
				folders.push_back(ToUtf8(entry.path().filename()));
			else if (!IsHiddenOrSystemFile(entry.path()) && HasExtensionFrom(entry.path(), extensions))
				files.push_back(ToUtf8(entry.path().filename()));
		}
		std::sort(files.begin(), files.end(), LessIgnoreCase);
		std::sort(folders.begin(), folders.end(), LessIgnoreCase);
		return {{"files", files}, {"folders", folders}};
	}
}

void BrowseFilesCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("BrowseFiles", [core = FCore, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!settings.Get().Features.BrowseFiles)
			throw RpcError(ErrorPathInaccessible, "Path inaccessible. Reason: file browsing is disabled in the plugin settings.");
		const std::string path = params.value("path", std::string());
		if (path.empty())
			return Roots();
		return Listing(path, RunOnMainThread(core, [&] { return SupportedAudioExtensions(core); })); });
}
