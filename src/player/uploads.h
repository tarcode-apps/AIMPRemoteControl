#pragma once

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

namespace player
{
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

	// Writes the files of an upload into a folder as their content arrives, so a
	// large one never passes through memory. The folder is created if need be.
	// A file that fails leaves nothing behind, the ones before it stay; so does
	// one still open when the writer goes, as when the client went away. Any thread.
	class UploadWriter
	{
	public:
		explicit UploadWriter(const std::string &folderUtf8);
		~UploadWriter();
		UploadWriter(const UploadWriter &) = delete;
		UploadWriter &operator=(const UploadWriter &) = delete;

		// Whether the folder's drive has room for `size` more bytes; true when it cannot tell.
		bool HasRoomFor(std::uint64_t size) const;

		// Closes the file before, then opens one for `clientFileName`, of which
		// only the file name part is used. False once anything failed.
		bool Begin(const std::string &clientFileName);
		bool Write(const char *data, std::size_t size);

		// Closes the last file and tells what was written.
		SavedUploads Finish();
		// Removes every file of the upload, as for a body that never arrived whole.
		void Abandon();

	private:
		bool Fail(UploadFailure failure);
		bool Close();
		void Discard();

		std::filesystem::path FFolder;
		std::ofstream FOut;
		std::filesystem::path FCurrent;
		SavedUploads FSaved;
	};
}
