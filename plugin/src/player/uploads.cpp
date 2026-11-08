#include "uploads.h"

#ifdef _WIN32
#include <windows.h>
#include <shlwapi.h>
#else
#include <fcntl.h>
#include <unistd.h>
#endif

#include <cctype>

#include "utf8Path.h"

namespace
{
#ifdef _WIN32
	// Device names Windows opens whatever the folder, with or without an extension.
	bool IsDeviceName(const std::string &name)
	{
		std::string stem = name.substr(0, name.find('.'));
		stem.erase(stem.find_last_not_of(' ') + 1);
		for (char &c : stem)
			c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
		if (stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL")
			return true;
		if (stem.rfind("COM", 0) != 0 && stem.rfind("LPT", 0) != 0)
			return false;
		const std::string number = stem.substr(3);
		return (number.size() == 1 && std::isdigit(static_cast<unsigned char>(number[0]))) ||
			   number == "\xC2\xB9" || number == "\xC2\xB2" || number == "\xC2\xB3";
	}
#else
	// No overlong forms, no surrogates, nothing past U+10FFFF: what Windows takes.
	bool IsUtf8(const std::string &text)
	{
		for (std::size_t i = 0; i < text.size();)
		{
			const unsigned char lead = static_cast<unsigned char>(text[i]);
			std::size_t length = 1;
			std::uint32_t code = lead;
			if (lead >= 0xC2 && lead <= 0xDF)
				length = 2, code = lead & 0x1F;
			else if (lead >= 0xE0 && lead <= 0xEF)
				length = 3, code = lead & 0x0F;
			else if (lead >= 0xF0 && lead <= 0xF4)
				length = 4, code = lead & 0x07;
			else if (lead >= 0x80)
				return false;
			if (text.size() - i < length)
				return false;
			for (std::size_t k = 1; k < length; ++k)
			{
				const unsigned char next = static_cast<unsigned char>(text[i + k]);
				if ((next & 0xC0) != 0x80)
					return false;
				code = (code << 6) | (next & 0x3F);
			}
			if ((length == 3 && (code < 0x800 || (code >= 0xD800 && code <= 0xDFFF))) ||
				(length == 4 && (code < 0x10000 || code > 0x10FFFF)))
				return false;
			i += length;
		}
		return true;
	}
#endif

	// Fails when anything is there under the name, a link too, wherever it leads.
	bool CreateNewFile(const std::filesystem::path &path)
	{
#ifdef _WIN32
		const HANDLE file = ::CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW,
										  FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
		if (file == INVALID_HANDLE_VALUE)
			return false;
		::CloseHandle(file);
#else
		const int file = ::open(path.c_str(), O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0666);
		if (file < 0)
			return false;
		::close(file);
#endif
		return true;
	}

	// A link that leads nowhere takes its name too.
	bool Taken(const std::filesystem::path &path)
	{
		std::error_code ec;
		return std::filesystem::exists(std::filesystem::symlink_status(path, ec));
	}

	// `parent / name`, numbered like CreateUniqueFile and created here, so that no
	// other upload takes it; empty when it could not be created.
	std::filesystem::path CreateUniqueFolder(const std::filesystem::path &parent, const std::filesystem::path &name)
	{
		for (int n = 1;; ++n)
		{
			std::filesystem::path target = parent / name;
			if (n > 1)
				target += " (" + std::to_string(n) + ")";
			std::error_code ec;
			if (std::filesystem::create_directory(target, ec))
				return target;
			if (!Taken(target))
				return {};
		}
	}

	// A write that failed on a drive this close to full ran out of room.
	constexpr std::uintmax_t NearlyFull = 1024 * 1024;
}

std::string player::SanitizeFileName(const std::string &utf8)
{
#ifdef _WIN32
	std::string name;
	if (const std::optional<std::filesystem::path> path = TryPathFromUtf8(utf8))
	{
		std::wstring wide = path->wstring();
		for (wchar_t &c : wide)
		{
			const UINT type = PathGetCharTypeW(c);
			if (c == L'\0' || type == GCT_INVALID || (type & (GCT_WILD | GCT_SEPARATOR)))
				c = L'_';
		}
		name = PathToUtf8(std::filesystem::path(wide));
		// Windows drops them when it opens the file, which makes ".. " the parent.
		name.erase(name.find_last_not_of(". ") + 1);
		if (IsDeviceName(name))
			name.insert(0, "_");
	}
#else
	std::string name = IsUtf8(utf8) ? utf8 : std::string();
	for (char &c : name)
		if (c == '/' || static_cast<unsigned char>(c) < 0x20)
			c = '_';
#endif
	return name.empty() || name == "." || name == ".." ? "_" : name;
}

std::filesystem::path player::CreateUniqueFile(const std::filesystem::path &folder, const std::filesystem::path &name)
{
	for (int n = 1;; ++n)
	{
		std::filesystem::path target = folder / name;
		if (n > 1)
		{
			std::filesystem::path numbered = name.stem();
			numbered += " (" + std::to_string(n) + ")";
			numbered += name.extension();
			target = folder / numbered;
		}
		if (CreateNewFile(target))
			return target;
		if (!Taken(target))
			return {};
	}
}

// A relative folder would be the player's working one.
player::UploadWriter::UploadWriter(const std::string &folderUtf8) : FFolder(PathFromUtf8(folderUtf8))
{
	std::error_code ec;
	FReady = FFolder.is_absolute() &&
			 (std::filesystem::create_directories(FFolder, ec) || std::filesystem::is_directory(FFolder, ec));
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
	if (!FReady)
		return Fail(UploadFailure::WriteFailed);
	std::optional<std::filesystem::path> target = NestedTarget(clientFileName);
	if (!target)
		return false;
	FCurrent = std::move(*target);
	FOut.open(FCurrent, std::ios::binary | std::ios::trunc);
	if (FOut)
		return true;
	std::error_code ec;
	std::filesystem::remove(FCurrent, ec);
	FCurrent.clear();
	return Fail(UploadFailure::WriteFailed);
}

// The folders on the way are created, the top one with a name of its own with
// its first file, and so is the file. A backslash is a character of a name, as
// it may be in one of Android or Linux, which the cleaning replaces where it is
// a separator.
std::optional<std::filesystem::path> player::UploadWriter::NestedTarget(const std::string &relativePath)
{
	std::vector<std::filesystem::path> names;
	for (std::size_t start = 0;;)
	{
		const std::size_t end = relativePath.find('/', start);
		const std::string part = relativePath.substr(start, end - start);
		if (part.empty() || part == "." || part == "..")
		{
			Fail(UploadFailure::InvalidName);
			return std::nullopt;
		}
		names.push_back(PathFromUtf8(SanitizeFileName(part)));
		if (end == std::string::npos)
			break;
		start = end + 1;
	}

	std::filesystem::path folder = FFolder;
	FCurrentIsItem = names.size() == 1;
	if (!FCurrentIsItem)
	{
		auto top = FTopFolders.find(names[0]);
		if (top == FTopFolders.end())
		{
			std::filesystem::path created = CreateUniqueFolder(FFolder, names[0]);
			if (created.empty())
			{
				Fail(UploadFailure::WriteFailed);
				return std::nullopt;
			}
			FSaved.Items.push_back(PathToUtf8(created));
			top = FTopFolders.emplace(names[0], std::move(created)).first;
		}
		folder = top->second;
		for (std::size_t i = 1; i + 1 < names.size(); ++i)
			folder /= names[i];
		std::error_code ec;
		std::filesystem::create_directories(folder, ec);
		if (ec)
		{
			Fail(UploadFailure::WriteFailed);
			return std::nullopt;
		}
	}
	std::filesystem::path file = CreateUniqueFile(folder, names.back());
	if (file.empty())
	{
		Fail(UploadFailure::WriteFailed);
		return std::nullopt;
	}
	return file;
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
	// Every folder among them was created by this upload, and all in it is the upload's.
	for (const std::string &item : FSaved.Items)
		std::filesystem::remove_all(PathFromUtf8(item), ec);
	FSaved.Paths.clear();
	FSaved.Items.clear();
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
	if (FCurrentIsItem)
		FSaved.Items.push_back(FSaved.Paths.back());
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
