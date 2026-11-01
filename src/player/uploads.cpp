#include "uploads.h"

#include <fstream>

#ifdef _WIN32
#include <windows.h>
#include <shlwapi.h>
#endif

#include "utf8Path.h"

namespace
{
	std::filesystem::path ClientFileName(const std::string &clientFileName)
	{
		std::filesystem::path name = PathFromUtf8(player::SanitizeFileName(clientFileName)).filename();
		if (name.empty() || name == "." || name == "..")
			name = "track";
		return name;
	}

	bool WriteFile(const std::filesystem::path &target, std::string_view content)
	{
		std::ofstream out(target, std::ios::binary | std::ios::trunc);
		return out && out.write(content.data(), static_cast<std::streamsize>(content.size()));
	}
}

std::string player::SanitizeFileName(const std::string &utf8)
{
#ifdef _WIN32
	std::wstring wide = PathFromUtf8(utf8).wstring();
	for (wchar_t &c : wide)
	{
		const UINT type = PathGetCharTypeW(c);
		if (c == L'\0' || type == GCT_INVALID || (type & (GCT_WILD | GCT_SEPARATOR)))
			c = L'_';
	}
	return PathToUtf8(std::filesystem::path(wide));
#else
	std::string name = utf8;
	for (char &c : name)
		if (c == '/' || c == '\0')
			c = '_';
	return name;
#endif
}

std::filesystem::path player::UniqueTarget(const std::filesystem::path &folder, const std::filesystem::path &name)
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

player::SavedUploads player::SaveUploads(const std::string &folderUtf8, const std::vector<UploadedFile> &files)
{
	const std::filesystem::path folder = PathFromUtf8(folderUtf8);
	std::error_code ec;
	std::filesystem::create_directories(folder, ec);

	SavedUploads saved;
	for (const UploadedFile &file : files)
	{
		const std::filesystem::space_info space = std::filesystem::space(folder, ec);
		if (!ec && space.available < file.Content.size())
		{
			saved.Failure = UploadFailure::NoSpace;
			return saved;
		}
		const std::filesystem::path target = UniqueTarget(folder, ClientFileName(file.Name));
		if (!WriteFile(target, file.Content))
		{
			std::filesystem::remove(target, ec);
			saved.Failure = UploadFailure::WriteFailed;
			return saved;
		}
		saved.Paths.push_back(PathToUtf8(target));
	}
	return saved;
}
