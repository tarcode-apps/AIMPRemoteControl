#pragma once

#include <filesystem>
#include <string>
#include <string_view>
#include <vector>

namespace player
{
	struct UploadedFile
	{
		std::string Name; // as the client named it; only its file name part is used
		std::string_view Content;
	};

	enum class UploadFailure
	{
		None,
		NoSpace, // the folder's drive has no room for the file
		WriteFailed
	};

	struct SavedUploads
	{
		std::vector<std::string> Paths; // of the files written, in order
		UploadFailure Failure = UploadFailure::None;
	};

	// Characters the file system refuses become underscores.
	std::string SanitizeFileName(const std::string &utf8);

	// `folder / name`, or the same with a " (2)", " (3)"… suffix when it is taken.
	std::filesystem::path UniqueTarget(const std::filesystem::path &folder, const std::filesystem::path &name);

	// Writes the files into `folder`, creating it if need be, and stops at the
	// first one the drive has no room for or that cannot be written; that one
	// leaves nothing behind, the ones before it stay. Any thread.
	SavedUploads SaveUploads(const std::string &folder, const std::vector<UploadedFile> &files);
}
