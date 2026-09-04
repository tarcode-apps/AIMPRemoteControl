#include "playlistsCommand.h"

#include <vector>

#include <nlohmann/json.hpp>

#include "mainThreadRunner.h"
#include "player/playlists.h"

namespace
{
	nlohmann::json ToJson(const player::PlaylistInfo &playlist)
	{
		return {
			{"id", playlist.Id},
			{"name", playlist.Name},
			{"readOnly", playlist.ReadOnly},
			{"entryCount", playlist.EntryCount},
		};
	}
}

void web::PlaylistsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.AddApi(HttpMethod::Get, "/api/v1/playlists", [core = FCore](const ApiRequest &) -> nlohmann::json
			   {
		const std::vector<player::PlaylistInfo> playlists = RunOnMainThread(core, [&]
																			 { return player::GetPlaylists(core); });
		nlohmann::json result = nlohmann::json::array();
		for (const player::PlaylistInfo &playlist : playlists)
			result.push_back(ToJson(playlist));
		return result; });
}
