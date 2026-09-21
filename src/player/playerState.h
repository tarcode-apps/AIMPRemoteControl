#pragma once

#include <cstdint>
#include <optional>
#include <string>

#include "playlistItems.h"

class IAIMPCore;

namespace player
{
	enum class PlaybackState
	{
		Stopped,
		Paused,
		Playing
	};

	enum class RepeatMode
	{
		Off,
		Playlist,
		Track
	};

	struct PlayingTrack
	{
		std::string PlaylistId;
		std::int32_t Index = 0;
		std::string TrackNumber; // as tagged, "3" or "3/12"
		std::string Title;
		std::string Artist;
		std::string Album;
		bool IsUrl = false;
	};

	struct PlayerState
	{
		PlaybackState State = PlaybackState::Stopped;
		double Position = 0; // seconds
		double Duration = 0; // seconds
		float Volume = 0;	 // 0..1
		bool Mute = false;
		RepeatMode Repeat = RepeatMode::Off;
		bool Shuffle = false;
		bool RadioCapture = false;
		std::optional<PlayingTrack> Track; // none while stopped, as the player's own window shows
	};

	PlayerState GetPlayerState(IAIMPCore *core);
	std::string PlayingPlaylistId(IAIMPCore *core);

	enum class PlayerCommand
	{
		Play,
		Pause,
		Stop,
		Next,
		Previous
	};

	// The player's own commands, so that they do what its buttons do: Play resumes a
	// paused track and restarts the last played one after a stop.
	bool SendPlayerCommand(IAIMPCore *core, PlayerCommand command);

	MutationResult PlayPlaylistItem(IAIMPCore *core, const std::string &playlistId, std::int32_t index);

	struct PlayerPatch
	{
		std::optional<double> Position;
		std::optional<float> Volume;
		std::optional<bool> Mute;
		std::optional<RepeatMode> Repeat;
		std::optional<bool> Shuffle;
	};

	bool ApplyPlayerPatch(IAIMPCore *core, const PlayerPatch &patch);
}
