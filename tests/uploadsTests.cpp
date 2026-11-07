// player::UploadWriter: what lands where when a client uploads tracks. The name
// comes from the client, so it is the boundary that keeps files in the folder.
#include "player/uploads.h"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <random>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

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

	// Each file written as a body would arrive: its content in pieces of `piece` bytes.
	player::SavedUploads Save(const fs::path &folder, const std::vector<std::pair<std::string, std::string_view>> &files, std::size_t piece = 3)
	{
		player::UploadWriter writer(PathToUtf8(folder));
		for (const auto &[name, content] : files)
		{
			if (!writer.Begin(name))
				break;
			for (std::size_t at = 0; at < content.size(); at += piece)
				writer.Write(content.data() + at, std::min(piece, content.size() - at));
		}
		return writer.Finish();
	}

	// The single file `name` was saved as, as a path.
	fs::path SaveOne(const fs::path &folder, const std::string &name, std::string_view content = "data")
	{
		const player::SavedUploads saved = Save(folder, {{name, content}});
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
	Check("the folder is created and the file written under its name, piece by piece",
		  first == folder / "Track.wav" && Read(first) == "first");

	const fs::path second = SaveOne(folder, "Track.wav", "second");
	const fs::path third = SaveOne(folder, "Track.wav", "third");
	Check("a taken name gets (2), then (3)", second == folder / "Track (2).wav" && third == folder / "Track (3).wav");
	Check("the earlier file is kept", Read(first) == "first" && Read(second) == "second");
	Check("a name without an extension is numbered too",
		  SaveOne(folder, "notes") == folder / "notes" && SaveOne(folder, "notes") == folder / "notes (2)");

#ifdef _WIN32
	Check("characters Windows refuses become underscores, a backslash among them",
		  SaveOne(folder, "a:b*c?d\"e<f>g|h\\i.wav") == folder / "a_b_c_d_e_f_g_h_i.wav");
	Check("a Windows path is one name in the folder", IsIn(SaveOne(folder, "C:\\Windows\\escaped.wav"), folder));
#else
	Check("a backslash is a character of the name", SaveOne(folder, "AC\\DC.wav") == folder / "AC\\DC.wav");
#endif
	Check("a name that is no UTF-8 becomes an underscore",
		  SaveOne(folder, "\xff\xfe.wav") == folder / "_" && player::SanitizeFileName("\xC0\xAF.wav") == "_" &&
			  player::SanitizeFileName("\xED\xA0\x80.wav") == "_" && player::SanitizeFileName("cut\xD0") == "_");
	Check("control characters become underscores", player::SanitizeFileName("a\r\nb\t.wav") == "a__b_.wav");
	Check("a name that leaves nothing is an underscore",
		  player::SanitizeFileName("") == "_" && player::SanitizeFileName(".") == "_" && player::SanitizeFileName("..") == "_");

	const std::string cyrillic = "Трек один.wav";
	Check("a UTF-8 name is kept", SaveOne(folder, cyrillic) == folder / PathFromUtf8(cyrillic));

	const player::SavedUploads both = Save(folder, {{"one.wav", "1"}, {"two.wav", "2"}});
	Check("several files are saved in order",
		  both.Failure == player::UploadFailure::None && both.Paths.size() == 2 &&
			  PathFromUtf8(both.Paths[0]) == folder / "one.wav" && PathFromUtf8(both.Paths[1]) == folder / "two.wav");

	{
		player::UploadWriter writer(PathToUtf8(folder));
		writer.Begin("cut.wav");
		writer.Write("half", 4);
	}
	Check("a file still open when the writer goes is removed", !fs::exists(folder / "cut.wav"));

	{
		player::UploadWriter writer(PathToUtf8(folder));
		writer.Begin("kept.wav");
		writer.Write("whole", 5);
		writer.Begin("broken.wav");
		writer.Write("ha", 2);
		writer.Finish();
		writer.Abandon();
	}
	Check("an abandoned upload leaves none of its files", !fs::exists(folder / "kept.wav") && !fs::exists(folder / "broken.wav"));

	player::UploadWriter writer(PathToUtf8(folder));
	Check("a little room is there, an exabyte is not", writer.HasRoomFor(1) && !writer.HasRoomFor(1ull << 60));
	Check("a folder of its own is ready", writer.Ready());
	{
		player::UploadWriter relative("relative uploads");
		Check("a folder that is no absolute path takes nothing",
			  !relative.Ready() && !player::UploadWriter("").Ready() && !relative.Begin("a.wav") &&
				  relative.Finish().Failure == player::UploadFailure::WriteFailed && !fs::exists("relative uploads"));
	}

	{
		player::UploadWriter one(PathToUtf8(folder));
		player::UploadWriter other(PathToUtf8(folder));
		one.Begin("shared.wav");
		other.Begin("shared.wav");
		one.Write("1", 1);
		other.Write("2", 1);
		const player::SavedUploads mine = one.Finish();
		const player::SavedUploads theirs = other.Finish();
		Check("two uploads at once never share a name",
			  mine.Paths.size() == 1 && theirs.Paths.size() == 1 && PathFromUtf8(mine.Paths[0]) == folder / "shared.wav" &&
				  PathFromUtf8(theirs.Paths[0]) == folder / "shared (2).wav" && Read(folder / "shared (2).wav") == "2");
		other.Abandon();
		Check("abandoning one leaves the other's file", Read(folder / "shared.wav") == "1");
	}

	fs::create_directories(folder / "taken.wav");
	Check("a folder of the name takes it too", SaveOne(folder, "taken.wav") == folder / "taken (2).wav");
	{
		std::error_code ec;
		fs::create_symlink(temporary.Path / "outside.wav", folder / "link.wav", ec);
		// Windows lets only an administrator or a developer create a link.
		if (!ec)
			Check("a link in the folder is never written through",
				  SaveOne(folder, "link.wav") == folder / "link (2).wav" && !fs::exists(temporary.Path / "outside.wav"));
	}

#ifdef _WIN32
	{
		// Windows drops trailing dots and spaces when it opens a file.
		const fs::path windows = temporary.Path / "windows";
		const fs::path dots = SaveOne(windows, ".. ");
		Check("dots and spaces stay in the folder", IsIn(dots, windows) && fs::exists(dots));
		Check("trailing dots and spaces are dropped", SaveOne(windows, "Song. . ") == windows / "Song");
		Check("a device name gets an underscore",
			  SaveOne(windows, "NUL.wav") == windows / "_NUL.wav" && SaveOne(windows, "com1") == windows / "_com1" &&
				  SaveOne(windows, "LPT\xC2\xB9.mp3") == windows / PathFromUtf8("_LPT\xC2\xB9.mp3"));
		Check("a name that only starts like a device is kept", SaveOne(windows, "Console.wav") == windows / "Console.wav");
	}
#endif

	const fs::path nested = temporary.Path / "nested";
	const auto folders = [&](const std::vector<std::pair<std::string, std::string_view>> &files)
	{ return Save(nested, files); };
	const auto paths = [](const std::vector<std::string> &utf8)
	{
		std::vector<fs::path> result;
		for (const std::string &path : utf8)
			result.push_back(PathFromUtf8(path));
		return result;
	};

	const player::SavedUploads album = folders({{"Album/CD1/01.flac", "a"}, {"Album/cover.jpg", "c"}, {"loose.mp3", "l"}});
	Check("the folders of the paths are recreated",
		  album.Failure == player::UploadFailure::None &&
			  paths(album.Paths) == std::vector<fs::path>{nested / "Album" / "CD1" / "01.flac", nested / "Album" / "cover.jpg", nested / "loose.mp3"} &&
			  Read(nested / "Album" / "CD1" / "01.flac") == "a");
	Check("the items are the top folder once and the file of its own",
		  paths(album.Items) == std::vector<fs::path>{nested / "Album", nested / "loose.mp3"});

	const player::SavedUploads again = folders({{"Album/CD1/01.flac", "b"}, {"loose.mp3", "m"}});
	Check("a top folder taken gets a name of its own, the old one untouched",
		  paths(again.Items) == std::vector<fs::path>{nested / "Album (2)", nested / "loose (2).mp3"} &&
			  Read(nested / "Album (2)" / "CD1" / "01.flac") == "b" && Read(nested / "Album" / "CD1" / "01.flac") == "a");
#ifdef _WIN32
	Check("a backslash separates no folders",
		  paths(folders({{"AC\\DC/Thunderstruck.wav", "d"}}).Paths) == std::vector<fs::path>{nested / "AC_DC" / "Thunderstruck.wav"});
#endif
	Check("the same path twice in an upload is numbered",
		  paths(folders({{"Twice/a.wav", "1"}, {"Twice/a.wav", "2"}}).Paths) ==
			  std::vector<fs::path>{nested / "Twice" / "a.wav", nested / "Twice" / "a (2).wav"});

	for (const std::string bad : {"", ".", "..", "../escaped.wav", "Album/../../escaped.wav", "/escaped.wav", "a//escaped.wav", "./escaped.wav", "Album/"})
	{
		const player::SavedUploads refused = folders({{bad, "x"}});
		Check(("a path with an empty, . or .. part is refused: " + bad).c_str(),
			  refused.Failure == player::UploadFailure::InvalidName && refused.Paths.empty() && !fs::exists(temporary.Path / "escaped.wav"));
	}
#ifdef _WIN32
	Check("a part of dots and spaces becomes an underscore",
		  paths(folders({{".. /inside.wav", "i"}}).Paths) == std::vector<fs::path>{nested / "_" / "inside.wav"});
#endif

	fs::create_directories(nested / "Keep");
	std::ofstream(nested / "Keep" / "old.wav") << "old";
	{
		player::UploadWriter writer(PathToUtf8(nested));
		for (const char *name : {"Keep/new.wav", "Keep/sub/deep.wav", "single.wav"})
		{
			writer.Begin(name);
			writer.Write("x", 1);
		}
		writer.Begin("Keep/broken.wav");
		writer.Write("h", 1);
		writer.Finish();
		writer.Abandon();
	}
	Check("an abandoned upload leaves none of its folders",
		  !fs::exists(nested / "Keep (2)") && !fs::exists(nested / "single.wav"));
	Check("an abandoned upload leaves the folder of the same name alone", Read(nested / "Keep" / "old.wav") == "old");

	return Finish();
}
