#include "getPlaylistsCommand.h"

#include <cstdint>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

#include "crc32.h"
#include "mainThreadRunner.h"
#include "player/playlists.h"
#include "helpers/remoteControlIdManager.h"

namespace
{
	// What the app compares to tell a playlist's content changed: the CRC32 of
	// its file names run together.
	std::uint32_t ContentCrc32(IAIMPCore *core, const std::string &playlistId)
	{
		std::uint32_t crc = 0;
		player::VisitPlaylistFiles(core, playlistId, [&](const std::string &file)
								   { crc = Crc32Update(crc, file.data(), file.size()); });
		return crc;
	}
}

nlohmann::json rpcapi::GetPlaylistsCommand::BuildPlaylists(IAIMPCore *core, RemoteControlIdManager &idManager,
												   const std::vector<std::string> &fields)
{
	const std::unordered_set<std::string> fieldSet(fields.begin(), fields.end());
	const bool withCrc32 = fieldSet.count("crc32") > 0;

	nlohmann::json result = nlohmann::json::array();
	for (const player::PlaylistInfo &playlist : player::GetPlaylists(core))
	{
		nlohmann::json out = nlohmann::json::object();
		if (fieldSet.count("id"))
			out["id"] = idManager.PlaylistGetOrGeneratePluginId(playlist.Id);
		if (fieldSet.count("title"))
			out["title"] = playlist.Name;
		if (fieldSet.count("readonly"))
			out["readonly"] = playlist.ReadOnly;
		if (fieldSet.count("entries_count"))
			out["entries_count"] = playlist.ItemCount;
		if (withCrc32)
			out["crc32"] = ContentCrc32(core, playlist.Id);
		result.push_back(std::move(out));
	}
	return result;
}

void rpcapi::GetPlaylistsCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetPlaylists", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
			{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		return RunOnMainThread(core, [&] { return BuildPlaylists(core, idManager, fields); }); });
}
