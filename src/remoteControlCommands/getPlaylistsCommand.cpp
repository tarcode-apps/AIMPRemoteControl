#include "getPlaylistsCommand.h"

#include <cstdint>
#include <functional>
#include <unordered_set>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "crc32.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	std::uint32_t ComputePlaylistCrc32(IAIMPPlaylist *playlist)
	{
		IAIMPObjectList *files = nullptr;
		if (Failed(playlist->GetFiles(0, &files)) || !files)
			return 0;

		std::uint32_t crc = 0;
		const INT32 count = files->GetCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPString *name = nullptr;
			if (Succeeded(files->GetObject(i, IID_IAIMPString, reinterpret_cast<void **>(&name))) && name)
			{
				const std::string utf8 = IAIMPStringToString(name);
				if (!utf8.empty())
					crc = Crc32Update(crc, utf8.data(), utf8.size());
				name->Release();
			}
		}
		files->Release();
		return crc;
	}

	nlohmann::json BuildPlaylistJson(
		IAIMPPlaylist *playlist,
		const std::unordered_set<std::string> &fields,
		RemoteControlIdManager &idManager)
	{
		IAIMPPlaylistProperties *props = nullptr;
		if (Failed(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) || !props)
			return nlohmann::json::object();

		nlohmann::json out = nlohmann::json::object();

		if (fields.count("id"))
		{
			const std::string aimpId = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_ID);
			out["id"] = idManager.PlaylistGetOrGeneratePluginId(aimpId);
		}
		if (fields.count("title"))
		{
			out["title"] = GetPropertyAsString(props, AIMP_PLAYLIST_PROPID_NAME);
		}
		if (fields.count("readonly"))
		{
			INT32 ro = 0;
			props->GetValueAsInt32(AIMP_PLAYLIST_PROPID_READONLY, &ro);
			out["readonly"] = ro != 0;
		}
		if (fields.count("entries_count"))
		{
			out["entries_count"] = playlist->GetItemCount();
		}
		if (fields.count("crc32"))
		{
			out["crc32"] = ComputePlaylistCrc32(playlist);
		}

		props->Release();
		return out;
	}
}

nlohmann::json GetPlaylistsCommand::BuildPlaylists(IAIMPCore *core, RemoteControlIdManager &idManager,
												   const std::vector<std::string> &fields)
{
	const std::unordered_set<std::string> fieldSet(fields.begin(), fields.end());
	nlohmann::json result = nlohmann::json::array();

	IAIMPServicePlaylistManager *mgr = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
		return result;

	const INT32 count = mgr->GetLoadedPlaylistCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylist *playlist = nullptr;
		if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
		{
			result.push_back(BuildPlaylistJson(playlist, fieldSet, idManager));
			playlist->Release();
		}
	}
	mgr->Release();
	return result;
}

void GetPlaylistsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetPlaylists", [core = FCore, &idManager = FIdManager](const nlohmann::json &params) -> nlohmann::json
	{
		const std::vector<std::string> fields = params.value("fields", std::vector<std::string>{});
		return RunOnMainThread(core, [&] { return BuildPlaylists(core, idManager, fields); });
	});
}
