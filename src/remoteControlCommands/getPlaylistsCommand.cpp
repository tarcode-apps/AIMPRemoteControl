#include "getPlaylistsCommand.h"

#include <unordered_set>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "mainThreadRunner.h"
#include "player/playlists.h"
#include "remoteControlIdManager.h"

nlohmann::json GetPlaylistsCommand::BuildPlaylists(IAIMPCore *core, RemoteControlIdManager &idManager,
												   const std::vector<std::string> &fields)
{
	const std::unordered_set<std::string> fieldSet(fields.begin(), fields.end());
	const bool withCrc32 = fieldSet.count("crc32") > 0;

	nlohmann::json result = nlohmann::json::array();
	for (const player::PlaylistInfo &playlist : player::GetPlaylists(core, withCrc32))
	{
		nlohmann::json out = nlohmann::json::object();
		if (fieldSet.count("id"))
			out["id"] = idManager.PlaylistGetOrGeneratePluginId(playlist.Id);
		if (fieldSet.count("title"))
			out["title"] = playlist.Name;
		if (fieldSet.count("readonly"))
			out["readonly"] = playlist.ReadOnly;
		if (fieldSet.count("entries_count"))
			out["entries_count"] = playlist.EntryCount;
		if (withCrc32)
			out["crc32"] = *playlist.ContentCrc32;
		result.push_back(std::move(out));
	}
	return result;
}

void GetPlaylistsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetPlaylists", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		return RunOnMainThread(core, [&] { return BuildPlaylists(core, idManager, fields); }); });
}
