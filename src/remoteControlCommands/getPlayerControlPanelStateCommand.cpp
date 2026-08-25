#include "getPlayerControlPanelStateCommand.h"

#include <cmath>
#include <cstdint>
#include <functional>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"
#include "remoteControlIdManager.h"

namespace
{
	const char *PlaybackStateName(INT32 state)
	{
		switch (state)
		{
		case AIMP_PLAYER_STATE_PLAYING:
			return "playing";
		case AIMP_PLAYER_STATE_PAUSED:
			return "paused";
		default:
			return "stopped";
		}
	}

	bool GetBoolProperty(IAIMPServiceMessageDispatcher *dispatcher, DWORD property)
	{
		BOOL value = 0;
		if (!dispatcher || Failed(dispatcher->Send(property, AIMP_MSG_PROPVALUE_GET, &value)))
			return false;
		return value != 0;
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

	void AddCurrentTrack(nlohmann::json &state, IAIMPCore *core, IAIMPServicePlayer *player,
						 RemoteControlIdManager &idManager)
	{
		IAIMPPlaylistItem *item = CurrentItemOf(core, player);
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

		if (player->GetState() != AIMP_PLAYER_STATE_STOPPED)
		{
			DOUBLE duration = 0.0, position = 0.0;
			player->GetDuration(&duration);
			player->GetPosition(&position);
			state["track_length"] = static_cast<std::int64_t>(std::ceil(duration)); // AIMP rounds duration up
			state["track_position"] = static_cast<std::int64_t>(position);
			state["current_track_source_radio"] = IsUrl(core, item);
		}

		item->Release();
	}
}

nlohmann::json GetPlayerControlPanelStateCommand::BuildState(IAIMPCore *core, RemoteControlIdManager &idManager)
{
	nlohmann::json state = nlohmann::json::object();

	IAIMPServicePlayer *player = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) || !player)
	{
		state["playback_state"] = "stopped";
		return state;
	}

	state["playback_state"] = PlaybackStateName(player->GetState());

	SINGLE volume = 0.0f;
	player->GetVolume(&volume);
	state["volume"] = static_cast<int>(std::lround(volume * 100.0f));

	BOOL mute = 0;
	player->GetMute(&mute);
	state["mute_mode_on"] = mute != 0;

	IAIMPServiceMessageDispatcher *dispatcher = nullptr;
	core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher));
	state["repeat_mode_on"] = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_REPEAT);
	state["shuffle_mode_on"] = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_SHUFFLE);
	state["radio_capture_mode_on"] = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_RADIOCAP);
	if (dispatcher)
		dispatcher->Release();

	AddCurrentTrack(state, core, player, idManager);

	player->Release();
	return state;
}

void GetPlayerControlPanelStateCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetPlayerControlPanelState", [core = FCore, &idManager = FIdManager](const nlohmann::json &) -> nlohmann::json
			{ return RunOnMainThread(core, [&]
									 { return BuildState(core, idManager); }); });
}

IAIMPPlaylistItem *GetPlayerControlPanelStateCommand::CurrentItem(IAIMPCore *core)
{
	IAIMPServicePlayer *player = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) || !player)
		return nullptr;
	IAIMPPlaylistItem *item = CurrentItemOf(core, player);
	player->Release();
	return item;
}
