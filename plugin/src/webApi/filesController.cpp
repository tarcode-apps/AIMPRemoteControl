#include "filesController.h"

#include "apiErrors.h"

#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/files.h"
#include "settings.h"

namespace
{
	const char *TypeName(player::FileType type)
	{
		return type == player::FileType::Playlist ? "playlist" : "audio";
	}

	// `types`: which files to list, `audio` by default.
	player::FileFilter FilterOf(const ApiRequest &request)
	{
		const std::vector<std::string> names = webapi::SplitCommaList(webapi::QueryString(request, "types"));
		if (names.empty())
			return {true, false};
		player::FileFilter filter{false, false};
		for (const std::string &name : names)
		{
			if (name == "audio")
				filter.Audio = true;
			else if (name == "playlists")
				filter.Playlists = true;
			else
				throw ApiError(400, "invalidQuery");
		}
		return filter;
	}

	// `sort`: `name` (the default) or `modified`; `descending`: `true` or `false`.
	player::FileSort SortOf(const ApiRequest &request)
	{
		player::FileSort sort;
		const std::string by = webapi::QueryString(request, "sort");
		if (by == "modified")
			sort.By = player::FileSortBy::Modified;
		else if (!by.empty() && by != "name")
			throw ApiError(400, "invalidQuery");
		const std::string descending = webapi::QueryString(request, "descending");
		if (descending == "true")
			sort.Descending = true;
		else if (!descending.empty() && descending != "false")
			throw ApiError(400, "invalidQuery");
		return sort;
	}

	nlohmann::json Roots()
	{
		nlohmann::json roots = nlohmann::json::array();
		for (const player::FileRoot &root : player::GetFileRoots())
			roots.push_back({{"path", root.Path}, {"label", root.Label}});
		return {{"roots", roots}};
	}

	nlohmann::json ToJson(const player::FolderListing &listing)
	{
		nlohmann::json folders = nlohmann::json::array(), files = nlohmann::json::array();
		for (const player::FolderEntry &folder : listing.Folders)
			if (!folder.Hidden)
				folders.push_back({{"name", folder.Name}, {"path", folder.Path}});
		for (const player::FileEntry &file : listing.Files)
			files.push_back({{"name", file.Name}, {"path", file.Path}, {"type", TypeName(file.Type)}, {"size", file.Size}});
		return {{"parent", listing.Parent}, {"folders", folders}, {"files", files}};
	}
}

void webapi::FilesController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/files", [core = FCore, &settings = FSettings](const ApiRequest &request) -> nlohmann::json
			   {
		if (!settings.Get().Features.BrowseFiles)
			throw ApiError(403, "browseFilesDisabled");
		const std::string path = QueryString(request, "path");
		const player::FileFilter filter = FilterOf(request);
		const player::FileSort sort = SortOf(request);
		if (path.empty())
			return Roots();
		const player::FileFormats formats = RunOnMainThread(core, [&]
															 { return player::GetFileFormats(core); });
		const std::optional<player::FolderListing> listing = player::ListFolder(path, formats, filter, sort);
		if (!listing)
			throw ApiError(404, "pathInaccessible");
		return ToJson(*listing); });

	endpoints.MapApi(HttpMethod::Get, "/api/v1/formats", [core = FCore](const ApiRequest &) -> nlohmann::json
			   {
		const player::FileFormats formats = RunOnMainThread(core, [&]
															 { return player::GetFileFormats(core); });
		return {{"audio", formats.Audio}, {"playlists", formats.Playlists}}; });
}
