#include "uploads.h"

#ifdef _WIN32
#include <windows.h>
#include <shlwapi.h>
#endif

#include "utf8Path.h"

namespace
{
	std::filesystem::path ClientFileName(const std::string &clientFileName)
	{
		// The name part alone: the client's directories are not recreated.
		const std::string nameOnly = clientFileName.substr(clientFileName.find_last_of("/\\") + 1);
		std::filesystem::path name = PathFromUtf8(player::SanitizeFileName(nameOnly)).filename();
		if (name.empty() || name == "." || name == "..")
			name = "track";
		return name;
	}

	// A write that failed on a drive this close to full ran out of room.
	constexpr std::uintmax_t NearlyFull = 1024 * 1024;
}

std::string player::SanitizeFileName(const std::string &utf8)
{
#ifdef _WIN32
	// A name that is no UTF-8 has nothing to keep; the caller falls back on "track".
	const std::optional<std::filesystem::path> path = TryPathFromUtf8(utf8);
	if (!path)
		return {};
	std::wstring wide = path->wstring();
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

player::UploadWriter::UploadWriter(const std::string &folderUtf8) : FFolder(PathFromUtf8(folderUtf8))
{
	std::error_code ec;
	std::filesystem::create_directories(FFolder, ec);
}

player::UploadWriter::~UploadWriter()
{
	Discard();
}

bool player::UploadWriter::HasRoomFor(std::uint64_t size) const
{
	std::error_code ec;
	const std::filesystem::space_info space = std::filesystem::space(FFolder, ec);
	return ec || space.available >= size;
}

bool player::UploadWriter::Begin(const std::string &clientFileName)
{
	if (FSaved.Failure != UploadFailure::None || !Close())
		return false;
	FCurrent = UniqueTarget(FFolder, ClientFileName(clientFileName));
	FOut.open(FCurrent, std::ios::binary | std::ios::trunc);
	return FOut ? true : Fail(UploadFailure::WriteFailed);
}

bool player::UploadWriter::Write(const char *data, std::size_t size)
{
	if (FSaved.Failure != UploadFailure::None || !FOut.is_open())
		return false;
	if (FOut.write(data, static_cast<std::streamsize>(size)))
		return true;
	return Fail(HasRoomFor(NearlyFull) ? UploadFailure::WriteFailed : UploadFailure::NoSpace);
}

player::SavedUploads player::UploadWriter::Finish()
{
	if (FSaved.Failure == UploadFailure::None)
		Close();
	return FSaved;
}

void player::UploadWriter::Abandon()
{
	Discard();
	std::error_code ec;
	for (const std::string &path : FSaved.Paths)
		std::filesystem::remove(PathFromUtf8(path), ec);
	FSaved.Paths.clear();
}

bool player::UploadWriter::Fail(UploadFailure failure)
{
	FSaved.Failure = failure;
	Discard();
	return false;
}

// The open file, if any, joins the saved ones.
bool player::UploadWriter::Close()
{
	if (!FOut.is_open())
		return true;
	FOut.close();
	if (FOut.fail())
	{
		std::error_code ec;
		std::filesystem::remove(FCurrent, ec);
		FCurrent.clear();
		FSaved.Failure = HasRoomFor(NearlyFull) ? UploadFailure::WriteFailed : UploadFailure::NoSpace;
		return false;
	}
	FSaved.Paths.push_back(PathToUtf8(FCurrent));
	FCurrent.clear();
	return true;
}

void player::UploadWriter::Discard()
{
	if (!FOut.is_open())
		return;
	FOut.close();
	std::error_code ec;
	std::filesystem::remove(FCurrent, ec);
	FCurrent.clear();
}
