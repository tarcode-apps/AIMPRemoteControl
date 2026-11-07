#include "files.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <filesystem>

#ifdef _WIN32
#include <windows.h>
#endif

#include "apiCore.h"
#include "apiFileManager.h"
#include "aimpHelper.h"
#include "naturalCompare.h"
#include "utf8Path.h"

namespace
{
	std::string LowerCase(std::string text)
	{
		for (char &c : text)
			c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
		return text;
	}

	// Stable, so that an order the system's comparison gets inconsistent on
	// cannot run the sort off the ends.
	template <typename Entry>
	void Sort(std::vector<Entry> &entries, const player::FileSort &sort)
	{
		std::stable_sort(entries.begin(), entries.end(), [&](const Entry &a, const Entry &b)
						 {
			if (sort.By == player::FileSortBy::Modified && a.Modified != b.Modified)
				return a.Modified < b.Modified;
			return player::NaturalCompare(a.Name, b.Name) < 0; });
		if (sort.Descending)
			std::reverse(entries.begin(), entries.end());
	}

	// The player's masks, "*.mp3;*.ogg;…", as plain extensions.
	std::vector<std::string> Extensions(IAIMPServiceFileFormats *service, DWORD category)
	{
		std::string masks;
		IAIMPString *s = nullptr;
		if (Succeeded(service->GetFormats(category, &s)) && s)
		{
			masks = IAIMPStringToString(s);
			s->Release();
		}

		std::vector<std::string> extensions;
		std::size_t start = 0;
		while (start < masks.size())
		{
			std::size_t end = masks.find(';', start);
			if (end == std::string::npos)
				end = masks.size();
			std::string mask = masks.substr(start, end - start);
			if (mask.rfind("*.", 0) == 0)
				mask.erase(0, 2);
			if (!mask.empty())
				extensions.push_back(LowerCase(mask));
			start = end + 1;
		}
		return extensions;
	}

	bool Has(const std::vector<std::string> &extensions, const std::string &extension)
	{
		return std::find(extensions.begin(), extensions.end(), extension) != extensions.end();
	}

	bool IsHiddenOrSystem(const std::filesystem::path &path)
	{
#ifdef _WIN32
		const DWORD attributes = GetFileAttributesW(path.c_str());
		return attributes != INVALID_FILE_ATTRIBUTES && (attributes & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) != 0;
#else
		const std::string name = PathToUtf8(path.filename());
		return !name.empty() && name[0] == '.';
#endif
	}

	// The file clock has no portable epoch, so the time is carried over to the
	// system clock by the distance from now.
	std::int64_t ModifiedSeconds(const std::filesystem::directory_entry &entry)
	{
		std::error_code ec;
		const std::filesystem::file_time_type written = entry.last_write_time(ec);
		if (ec)
			return 0;
		const auto sinceNow = std::chrono::duration_cast<std::chrono::system_clock::duration>(written - std::filesystem::file_time_type::clock::now());
		const auto system = std::chrono::system_clock::now() + sinceNow;
		return std::chrono::duration_cast<std::chrono::seconds>(system.time_since_epoch()).count();
	}

	// The extension without the dot, lower-case; empty when there is none.
	std::string ExtensionOf(const std::filesystem::path &path)
	{
		std::string ext = PathToUtf8(path.extension());
		if (!ext.empty())
			ext.erase(0, 1);
		return LowerCase(ext);
	}
}

player::FileFormats player::GetFileFormats(IAIMPCore *core)
{
	FileFormats formats;
	IAIMPServiceFileFormats *service = AcquireService<IAIMPServiceFileFormats>(core, IID_IAIMPServiceFileFormats);
	if (!service)
		return formats;
	formats.Audio = Extensions(service, AIMP_SERVICE_FILEFORMATS_CATEGORY_AUDIO);
	formats.Playlists = Extensions(service, AIMP_SERVICE_FILEFORMATS_CATEGORY_PLAYLISTS);
	service->Release();
	// The player expands a CUE sheet into its tracks, as it does a playlist, but
	// lists it in neither category.
	if (!Has(formats.Audio, "cue") && !Has(formats.Playlists, "cue"))
		formats.Playlists.push_back("cue");
	return formats;
}

std::vector<player::FileRoot> player::GetFileRoots()
{
	std::vector<FileRoot> roots;
#ifdef _WIN32
	wchar_t buffer[512] = {};
	const DWORD length = GetLogicalDriveStringsW(static_cast<DWORD>(std::size(buffer) - 1), buffer);
	for (const wchar_t *drive = buffer; drive < buffer + length && *drive; drive += wcslen(drive) + 1)
	{
		// An optical drive without a disc takes seconds to answer for its label.
		wchar_t label[MAX_PATH + 1] = {};
		if (GetDriveTypeW(drive) != DRIVE_CDROM)
			GetVolumeInformationW(drive, label, MAX_PATH, nullptr, nullptr, nullptr, nullptr, 0);
		roots.push_back({PathToUtf8(std::filesystem::path(drive)), PathToUtf8(std::filesystem::path(label))});
	}
#else
	roots.push_back({"/", ""});
#endif
	return roots;
}

std::optional<player::FolderListing> player::ListFolder(const std::string &pathUtf8, const FileFormats &formats, const FileFilter &filter,
														const FileSort &sort)
{
	const std::optional<std::filesystem::path> folder = TryPathFromUtf8(pathUtf8);
	if (!folder)
		return std::nullopt;
	std::error_code ec;
	std::filesystem::directory_iterator it(*folder, std::filesystem::directory_options::skip_permission_denied, ec);
	if (ec)
		return std::nullopt;

	// The times are read only for the order that needs them.
	const bool byTime = sort.By == FileSortBy::Modified;
	const auto modified = [&](const std::filesystem::directory_entry &entry)
	{ return byTime ? ModifiedSeconds(entry) : 0; };

	FolderListing listing;
	for (const auto &entry : it)
	{
		const std::filesystem::path &path = entry.path();
		if (entry.is_directory(ec))
		{
			listing.Folders.push_back({PathToUtf8(path.filename()), PathToUtf8(path), modified(entry), IsHiddenOrSystem(path)});
			continue;
		}
		if (IsHiddenOrSystem(path))
			continue;
		const std::string extension = ExtensionOf(path);
		FileType type;
		if (filter.Audio && Has(formats.Audio, extension))
			type = FileType::Audio;
		else if (filter.Playlists && Has(formats.Playlists, extension))
			type = FileType::Playlist;
		else
			continue;
		const std::uintmax_t size = entry.file_size(ec);
		listing.Files.push_back({PathToUtf8(path.filename()), PathToUtf8(path), type, ec ? 0 : static_cast<std::int64_t>(size), modified(entry)});
	}
	Sort(listing.Folders, sort);
	Sort(listing.Files, sort);

	// A drive or the file system root is its own parent.
	const std::filesystem::path parent = folder->parent_path();
	if (!parent.empty() && parent != *folder)
		listing.Parent = PathToUtf8(parent);
	return listing;
}
