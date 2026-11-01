#include "browseFilesCommand.h"

#include "apiErrors.h"

#include <optional>
#include <string>

#include <nlohmann/json.hpp>
#include "apiCore.h"
#include "helpers/permissions.h"
#include "mainThreadRunner.h"
#include "player/files.h"
#include "settings.h"

namespace
{
	constexpr int ErrorPathInaccessible = 33;

	nlohmann::json Roots()
	{
		nlohmann::json labels = nlohmann::json::array(), paths = nlohmann::json::array();
		for (const player::FileRoot &root : player::GetFileRoots())
		{
			labels.push_back(root.Label);
			paths.push_back(root.Path);
		}
		return {{"labels", labels}, {"paths", paths}};
	}

	nlohmann::json Listing(const player::FolderListing &listing)
	{
		nlohmann::json files = nlohmann::json::array(), folders = nlohmann::json::array();
		for (const player::FileEntry &file : listing.Files)
			files.push_back(file.Name);
		for (const player::FolderEntry &folder : listing.Folders)
			folders.push_back(folder.Name);
		return {{"files", files}, {"folders", folders}};
	}
}

void rpcapi::BrowseFilesCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("BrowseFiles", [core = FCore, &settings = FSettings](const nlohmann::json &params) -> nlohmann::json
			{
		if (!CanBrowseFiles(settings.Get().Features))
			throw LocalizedRpcError(ErrorPathInaccessible, "browseFilesDisabled");
		const std::string path = params.value("path", std::string());
		if (path.empty())
			return Roots();
		const player::FileFormats formats = RunOnMainThread(core, [&] { return player::GetFileFormats(core); });
		const std::optional<player::FolderListing> listing = player::ListFolder(path, formats, {true, false});
		if (!listing)
			throw LocalizedRpcError(ErrorPathInaccessible, "pathInaccessible");
		return Listing(*listing); });
}
