// player::SaveUploads: what lands where when a client uploads tracks. The name
// comes from the client, so it is the boundary that keeps files in the folder.
#include "player/uploads.h"

#include <filesystem>
#include <fstream>
#include <iterator>
#include <random>
#include <string>

#include "check.h"
#include "utf8Path.h"

namespace fs = std::filesystem;

namespace
{
	// A folder of its own under the system's temporary one, removed afterwards.
	struct TemporaryFolder
	{
		fs::path Path;

		TemporaryFolder()
		{
			Path = fs::temp_directory_path() / ("aimp-rc-uploads-" + std::to_string(std::random_device()()));
			fs::create_directories(Path);
		}

		~TemporaryFolder()
		{
			std::error_code ec;
			fs::remove_all(Path, ec);
		}
	};

	std::string Read(const fs::path &file)
	{
		std::ifstream in(file, std::ios::binary);
		return std::string(std::istreambuf_iterator<char>(in), {});
	}

	// The single file `name` was saved as, as a path.
	fs::path SaveOne(const fs::path &folder, const std::string &name, std::string_view content = "data")
	{
		const player::SavedUploads saved = player::SaveUploads(PathToUtf8(folder), {{name, content}});
		if (saved.Failure != player::UploadFailure::None || saved.Paths.size() != 1)
			return {};
		return PathFromUtf8(saved.Paths[0]);
	}

	bool IsIn(const fs::path &file, const fs::path &folder)
	{
		return !file.empty() && file.parent_path() == folder;
	}
}

int main()
{
	TemporaryFolder temporary;
	const fs::path folder = temporary.Path / "uploads";

	const fs::path first = SaveOne(folder, "Track.wav", "first");
	Check("the folder is created and the file written under its name",
		  first == folder / "Track.wav" && Read(first) == "first");

	const fs::path second = SaveOne(folder, "Track.wav", "second");
	const fs::path third = SaveOne(folder, "Track.wav", "third");
	Check("a taken name gets (2), then (3)", second == folder / "Track (2).wav" && third == folder / "Track (3).wav");
	Check("the earlier file is kept", Read(first) == "first" && Read(second) == "second");
	Check("a name without an extension is numbered too",
		  SaveOne(folder, "notes") == folder / "notes" && SaveOne(folder, "notes") == folder / "notes (2)");

	Check("a path up the tree stays in the folder", IsIn(SaveOne(folder, "../../escaped.wav"), folder));
	Check("an absolute path stays in the folder", IsIn(SaveOne(folder, "/etc/escaped.wav"), folder));
#ifdef _WIN32
	Check("a Windows path stays in the folder", IsIn(SaveOne(folder, "C:\\Windows\\escaped.wav"), folder));
	Check("characters Windows refuses become underscores",
		  SaveOne(folder, "a:b*c?d\"e<f>g|h.wav") == folder / "a_b_c_d_e_f_g_h.wav");
#endif
	Check("an empty name is called track", SaveOne(folder, "") == folder / "track");
	Check("a dot is called track", SaveOne(folder, ".") == folder / "track (2)");
	Check("two dots are called track", SaveOne(folder, "..") == folder / "track (3)");

	const std::string cyrillic = "Трек один.wav";
	Check("a UTF-8 name is kept", SaveOne(folder, cyrillic) == folder / PathFromUtf8(cyrillic));

	const player::SavedUploads both =
		player::SaveUploads(PathToUtf8(folder), {{"one.wav", "1"}, {"two.wav", "2"}});
	Check("several files are saved in order",
		  both.Failure == player::UploadFailure::None && both.Paths.size() == 2 &&
			  PathFromUtf8(both.Paths[0]) == folder / "one.wav" && PathFromUtf8(both.Paths[1]) == folder / "two.wav");

	return Finish();
}
