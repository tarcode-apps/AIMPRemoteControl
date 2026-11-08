#pragma once

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace player
{
	enum class UploadFailure
	{
		None,
		NoSpace, // the folder's drive has no room for the file
		WriteFailed, // the folder too, when it is no absolute path or cannot be created
		InvalidName // a relative path with an empty, "." or ".." part
	};

	struct SavedUploads
	{
		std::vector<std::string> Paths; // of the files written, in order
		// What the upload brought, in the order it came: each top folder once, and
		// the files outside any.
		std::vector<std::string> Items;
		UploadFailure Failure = UploadFailure::None;
	};

	// A name the file system takes as one entry of a folder: control characters
	// and those it refuses become underscores, and a name that is no UTF-8, or that
	// leaves nothing, "." or ".." behind, is "_".
	std::string SanitizeFileName(const std::string &utf8);

	// Creates the file `folder / name`, or the same with a " (2)", " (3)"… suffix
	// when the name is taken, and tells which; empty when it could not. The file is
	// always a new one, so nothing that was there is written through, a link
	// among them, and two uploads never share a name.
	std::filesystem::path CreateUniqueFile(const std::filesystem::path &folder, const std::filesystem::path &name);

	// Writes the files of an upload into a folder as their content arrives, so a
	// large one never passes through memory. The folder is created if need be.
	// The name a client sends is a path relative to what the user picked, with `/`
	// between its parts; its folders are recreated, and each top folder gets a name
	// of its own in the folder. A file that fails leaves nothing behind, the ones
	// before it stay; so does one still open when the writer goes, as when the
	// client went away. Any thread.
	class UploadWriter
	{
	public:
		explicit UploadWriter(const std::string &folderUtf8);
		~UploadWriter();
		UploadWriter(const UploadWriter &) = delete;
		UploadWriter &operator=(const UploadWriter &) = delete;

		// Whether the folder is there to take files.
		bool Ready() const { return FReady; }
		// Whether the folder's drive has room for `size` more bytes; true when it cannot tell.
		bool HasRoomFor(std::uint64_t size) const;

		// Closes the file before, then opens one for the path the client sent.
		// False once anything failed.
		bool Begin(const std::string &clientFileName);
		bool Write(const char *data, std::size_t size);

		// Closes the last file and tells what was written.
		SavedUploads Finish();
		// Removes everything of the upload, its folders too.
		void Abandon();

	private:
		std::optional<std::filesystem::path> NestedTarget(const std::string &relativePath);
		bool Fail(UploadFailure failure);
		bool Close();
		void Discard();

		std::filesystem::path FFolder;
		bool FReady = false;
		std::ofstream FOut;
		std::filesystem::path FCurrent;
		bool FCurrentIsItem = false; // a file outside any top folder
		std::map<std::filesystem::path, std::filesystem::path> FTopFolders; // the client's name, the one given
		SavedUploads FSaved;
	};
}
