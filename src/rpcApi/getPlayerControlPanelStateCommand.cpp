#include "getPlayerControlPanelStateCommand.h"

#include <cmath>
#include <cstdint>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "player/playerState.h"
#include "helpers/remoteControlIdManager.h"

namespace
{
	const char *PlaybackStateName(player::PlaybackState state)
	{
		switch (state)
		{
		case player::PlaybackState::Playing:
			return "playing";
		case player::PlaybackState::Paused:
			return "paused";
		default:
			return "stopped";
		}
	}

	bool IsUrl(IAIMPCore *core, IAIMPPlaylistItem *item)
	{
		IAIMPString *fileName = nullptr;
		if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_FILENAME, IID_IAIMPString,
										  reinterpret_cast<void **>(&fileName))) ||
			!fileName)
			return false;

		bool result = false;
		IAIMPServiceFileURI *uriService = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&uriService))) && uriService)
		{
			result = uriService->IsURL(fileName) == S_OK;
			uriService->Release();
		}
		fileName->Release();
		return result;
	}

	// The app cannot show an empty player, so a stopped player reports the focused
	// item, then the playback cursor, then the first item.
	IAIMPPlaylistItem *CurrentItemOf(IAIMPCore *core, IAIMPServicePlayer *player)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Succeeded(player->GetPlaylistItem(&item)) && item)
			return item;

		IAIMPServicePlaylistManager *mgr = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
			return nullptr;
		IAIMPPlaylist *playlist = nullptr;
		if (Failed(mgr->GetPlayingPlaylist(&playlist)) || !playlist)
			if (Failed(mgr->GetActivePlaylist(&playlist)))
				playlist = nullptr;
		mgr->Release();
		if (!playlist)
			return nullptr;

		IAIMPPlaylistProperties *props = nullptr;
		if (Succeeded(playlist->QueryInterface(IID_IAIMPPlaylistProperties, reinterpret_cast<void **>(&props))) && props)
		{
			if (Failed(props->GetValueAsObject(AIMP_PLAYLIST_PROPID_FOCUSED_OBJECT, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))))
				item = nullptr;
			if (!item && Failed(props->GetValueAsObject(AIMP_PLAYLIST_PROPID_PLAYBACKCURSOR, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))))
				item = nullptr;
			props->Release();
		}
		if (!item && playlist->GetItemCount() > 0 && Failed(playlist->GetItem(0, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))))
			item = nullptr;
		playlist->Release();
		return item;
	}

	void AddCurrentTrack(nlohmann::json &state, IAIMPCore *core, const player::PlayerState &playerState,
						 RemoteControlIdManager &idManager)
	{
		IAIMPServicePlayer *player = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) || !player)
			return;
		IAIMPPlaylistItem *item = CurrentItemOf(core, player);
		player->Release();
		if (!item)
			return;

		IAIMPPlaylist *playlist = nullptr;
		item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist));
		const std::string playlistAIMPId = GetPlaylistAIMPId(playlist);
		if (playlist)
			playlist->Release();

		INT32 itemIndex = 0;
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &itemIndex);

		state["playlist_id"] = idManager.PlaylistGetOrGeneratePluginId(playlistAIMPId);
		state["track_id"] = idManager.PlaylistItemGetOrGeneratePluginId(playlistAIMPId, itemIndex);

		if (playerState.State != player::PlaybackState::Stopped)
		{
			state["track_length"] = static_cast<std::int64_t>(std::ceil(playerState.Duration)); // AIMP rounds duration up
			state["track_position"] = static_cast<std::int64_t>(playerState.Position);
			state["current_track_source_radio"] = IsUrl(core, item);
		}

		item->Release();
	}
}

nlohmann::json rpcapi::GetPlayerControlPanelStateCommand::BuildState(IAIMPCore *core, RemoteControlIdManager &idManager)
{
	const player::PlayerState playerState = player::GetPlayerState(core);
	nlohmann::json state = {
		{"playback_state", PlaybackStateName(playerState.State)},
		{"volume", static_cast<int>(std::lround(playerState.Volume * 100.0f))},
		{"mute_mode_on", playerState.Mute},
		{"repeat_mode_on", playerState.Repeat == player::RepeatMode::Track},
		{"shuffle_mode_on", playerState.Shuffle},
		{"radio_capture_mode_on", playerState.RadioCapture},
	};
	AddCurrentTrack(state, core, playerState, idManager);
	return state;
}

void rpcapi::GetPlayerControlPanelStateCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetPlayerControlPanelState", [core = FCore, &idManager = FIdManager](const nlohmann::json &) -> nlohmann::json
			{ return RunOnMainThread(core, [&]
									 { return BuildState(core, idManager); }); });
}

IAIMPPlaylistItem *rpcapi::GetPlayerControlPanelStateCommand::CurrentItem(IAIMPCore *core)
{
	IAIMPServicePlayer *player = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) || !player)
		return nullptr;
	IAIMPPlaylistItem *item = CurrentItemOf(core, player);
	player->Release();
	return item;
}
