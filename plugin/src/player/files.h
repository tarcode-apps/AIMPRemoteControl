#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

class IAIMPCore;

namespace player
{
	// The extensions the player opens, lower-case and without the dot.
	struct FileFormats
	{
		std::vector<std::string> Audio;
		std::vector<std::string> Playlists;
	};

	// Main thread only.
	FileFormats GetFileFormats(IAIMPCore *core);

	enum class FileType
	{
		Audio,
		Playlist
	};

	struct FileRoot
	{
		std::string Path;
		std::string Label; // the volume label; empty when it has none
	};

	struct FolderEntry
	{
		std::string Name;
		std::string Path;
		std::int64_t Modified = 0; // seconds since the Unix epoch
		bool Hidden = false;
	};

	struct FileEntry
	{
		std::string Name;
		std::string Path;
		FileType Type = FileType::Audio;
		std::int64_t Size = 0;	   // bytes
		std::int64_t Modified = 0; // seconds since the Unix epoch
	};

	struct FolderListing
	{
		std::string Parent; // empty for a root
		std::vector<FolderEntry> Folders;
		std::vector<FileEntry> Files;
	};

	// Which files a listing keeps.
	struct FileFilter
	{
		bool Audio = true;
		bool Playlists = false;
	};

	enum class FileSortBy
	{
		Name,
		Modified
	};

	struct FileSort
	{
		FileSortBy By = FileSortBy::Name;
		bool Descending = false;
	};

	// The drives, or the file system root; any thread.
	std::vector<FileRoot> GetFileRoots();

	// The folders and the files of the formats in `filter`, each in the order asked
	// for; names sort as the system's own file manager sorts them. Hidden and system
	// files are left out. Nothing when the folder cannot be read. Any thread.
	std::optional<FolderListing> ListFolder(const std::string &path, const FileFormats &formats, const FileFilter &filter,
											const FileSort &sort = {});
}
