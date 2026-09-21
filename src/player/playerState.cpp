#include "playerState.h"

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playlistItemContext.h"

namespace
{
	// AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST values.
	constexpr INT32 JumpToNextPlaylistOnEnd = 0;
	constexpr INT32 RepeatPlaylistOnEnd = 1;

	IAIMPServicePlayer *PlayerService(IAIMPCore *core)
	{
		IAIMPServicePlayer *player = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))))
			return nullptr;
		return player;
	}

	IAIMPServiceMessageDispatcher *DispatcherService(IAIMPCore *core)
	{
		IAIMPServiceMessageDispatcher *dispatcher = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))))
			return nullptr;
		return dispatcher;
	}

	bool GetBoolProperty(IAIMPServiceMessageDispatcher *dispatcher, DWORD property)
	{
		BOOL value = 0;
		return Succeeded(dispatcher->Send(property, AIMP_MSG_PROPVALUE_GET, &value)) && value != 0;
	}

	bool SetBoolProperty(IAIMPServiceMessageDispatcher *dispatcher, DWORD property, bool value)
	{
		BOOL raw = value ? 1 : 0;
		return Succeeded(dispatcher->Send(property, AIMP_MSG_PROPVALUE_SET, &raw));
	}

	player::PlaybackState ToPlaybackState(INT32 state)
	{
		switch (state)
		{
		case AIMP_PLAYER_STATE_PLAYING:
			return player::PlaybackState::Playing;
		case AIMP_PLAYER_STATE_PAUSED:
			return player::PlaybackState::Paused;
		default:
			return player::PlaybackState::Stopped;
		}
	}

	DWORD CommandMessage(player::PlayerCommand command)
	{
		switch (command)
		{
		case player::PlayerCommand::Play:
			return AIMP_MSG_CMD_PLAY;
		case player::PlayerCommand::Pause:
			return AIMP_MSG_CMD_PAUSE;
		case player::PlayerCommand::Stop:
			return AIMP_MSG_CMD_STOP;
		case player::PlayerCommand::Next:
			return AIMP_MSG_CMD_NEXT;
		case player::PlayerCommand::Previous:
			return AIMP_MSG_CMD_PREV;
		}
		return 0;
	}

	std::optional<player::PlayingTrack> ReadTrack(IAIMPCore *core, IAIMPServicePlayer *player)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(player->GetPlaylistItem(&item)) || !item)
			return std::nullopt;

		player::PlayingTrack track;
		IAIMPPlaylist *playlist = nullptr;
		if (Succeeded(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist))) && playlist)
		{
			track.PlaylistId = GetPlaylistAIMPId(playlist);
			playlist->Release();
		}
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &track.Index);

		IAIMPServiceFileURI *fileUriService = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServiceFileURI, reinterpret_cast<void **>(&fileUriService))))
			fileUriService = nullptr;
		{
			const PlaylistItemContext ctx(fileUriService, item);
			track.TrackNumber = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_TRACKNUMBER));
			track.Title = ToStringAndRelease(ItemTitleOrFileName(ctx));
			track.Artist = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ARTIST));
			track.Album = ToStringAndRelease(ItemFileInfoString(ctx, AIMP_FILEINFO_PROPID_ALBUM));
			track.IsUrl = fileUriService && ctx.FileUri && fileUriService->IsURL(ctx.FileUri) == S_OK;
		}
		if (fileUriService)
			fileUriService->Release();
		item->Release();

		// The stream's own tags: a radio station's item names the station, the player's
		// info names what it is playing right now.
		IAIMPFileInfo *info = nullptr;
		if (Succeeded(player->GetInfo(&info)) && info)
		{
			const std::string title = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_TITLE);
			if (!title.empty())
			{
				track.Title = title;
				track.Artist = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ARTIST);
				track.Album = GetPropertyAsString(info, AIMP_FILEINFO_PROPID_ALBUM);
			}
			info->Release();
		}
		return track;
	}
}

player::PlayerState player::GetPlayerState(IAIMPCore *core)
{
	PlayerState state;
	IAIMPServicePlayer *player = PlayerService(core);
	if (!player)
		return state;

	state.State = ToPlaybackState(player->GetState());
	player->GetVolume(&state.Volume);
	BOOL mute = 0;
	player->GetMute(&mute);
	state.Mute = mute != 0;
	if (IAIMPServiceMessageDispatcher *dispatcher = DispatcherService(core))
	{
		INT32 onEnd = 0;
		dispatcher->Send(AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST, AIMP_MSG_PROPVALUE_GET, &onEnd);
		state.Repeat = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_REPEAT) ? RepeatMode::Track
					   : onEnd == RepeatPlaylistOnEnd					  ? RepeatMode::Playlist
																		  : RepeatMode::Off;
		state.Shuffle = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_SHUFFLE);
		state.RadioCapture = GetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_RADIOCAP);
		dispatcher->Release();
	}
	if (state.State != PlaybackState::Stopped)
	{
		player->GetPosition(&state.Position);
		player->GetDuration(&state.Duration);
		state.Track = ReadTrack(core, player);
	}
	player->Release();
	return state;
}

std::string player::PlayingPlaylistId(IAIMPCore *core)
{
	IAIMPServicePlaylistManager *mgr = nullptr;
	if (Failed(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) || !mgr)
		return {};
	std::string id;
	IAIMPPlaylist *playlist = nullptr;
	if (Succeeded(mgr->GetPlayingPlaylist(&playlist)) && playlist)
	{
		id = GetPlaylistAIMPId(playlist);
		playlist->Release();
	}
	mgr->Release();
	return id;
}

bool player::SendPlayerCommand(IAIMPCore *core, PlayerCommand command)
{
	IAIMPServiceMessageDispatcher *dispatcher = DispatcherService(core);
	if (!dispatcher)
		return false;
	const bool ok = Succeeded(dispatcher->Send(CommandMessage(command), 0, nullptr));
	dispatcher->Release();
	return ok;
}

player::MutationResult player::PlayPlaylistItem(IAIMPCore *core, const std::string &playlistId, std::int32_t index)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	IAIMPPlaylistItem *item = nullptr;
	if (index < 0 || index >= playlist->GetItemCount() ||
		Failed(playlist->GetItem(index, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
	{
		playlist->Release();
		return MutationResult::ItemNotFound;
	}
	playlist->Release();

	IAIMPServicePlayer *player = PlayerService(core);
	const bool ok = player && Succeeded(player->Play2(item));
	if (player)
		player->Release();
	item->Release();
	return ok ? MutationResult::Ok : MutationResult::Failed;
}

bool player::ApplyPlayerPatch(IAIMPCore *core, const PlayerPatch &patch)
{
	bool ok = true;
	if (IAIMPServicePlayer *player = PlayerService(core))
	{
		if (patch.Position)
			ok = Succeeded(player->SetPosition(*patch.Position)) && ok;
		if (patch.Volume)
			ok = Succeeded(player->SetVolume(*patch.Volume)) && ok;
		if (patch.Mute)
			ok = Succeeded(player->SetMute(*patch.Mute ? 1 : 0)) && ok;
		player->Release();
	}
	else
		ok = false;
	if (patch.Repeat || patch.Shuffle)
	{
		IAIMPServiceMessageDispatcher *dispatcher = DispatcherService(core);
		if (!dispatcher)
			return false;
		if (patch.Repeat)
		{
			ok = SetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_REPEAT, *patch.Repeat == RepeatMode::Track) && ok;
			INT32 onEnd = JumpToNextPlaylistOnEnd;
			dispatcher->Send(AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST, AIMP_MSG_PROPVALUE_GET, &onEnd);
			// Leaving the playlist repeat restores the default; "do nothing" is kept.
			if (*patch.Repeat == RepeatMode::Playlist)
				onEnd = RepeatPlaylistOnEnd;
			else if (onEnd == RepeatPlaylistOnEnd)
				onEnd = JumpToNextPlaylistOnEnd;
			ok = Succeeded(dispatcher->Send(AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST, AIMP_MSG_PROPVALUE_SET, &onEnd)) && ok;
		}
		if (patch.Shuffle)
			ok = SetBoolProperty(dispatcher, AIMP_MSG_PROPERTY_SHUFFLE, *patch.Shuffle) && ok;
		dispatcher->Release();
	}
	return ok;
}
