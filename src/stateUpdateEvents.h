#pragma once

#include <array>
#include <bitset>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class IAIMPCore;
class IAIMPPlaylist;

class StateUpdateEvents
{
public:
	enum Kind
	{
		ControlPanel, // playback state, track, volume, mute, repeat, shuffle, radio capture, seek
		Playlists,	  // playlist added/removed/renamed or its content changed
		Queue,		  // playback queue changed
		Timer,		  // sleep timer set/cancelled/fired (SleepTimer)
		KindCount
	};

	StateUpdateEvents();
	~StateUpdateEvents();
	StateUpdateEvents(const StateUpdateEvents &) = delete;
	StateUpdateEvents &operator=(const StateUpdateEvents &) = delete;

	void Start(IAIMPCore *core);
	void Stop();

	bool Wait(Kind kind, std::chrono::milliseconds timeout);

	using Versions = std::array<std::uint64_t, KindCount>;
	Versions Current();
	std::bitset<KindCount> WaitAny(Versions &seen, std::chrono::milliseconds timeout);

	// Per-playlist change counters keyed by AIMP playlist id; a playlist that is not
	// loaded has no entry.
	using PlaylistRevisions = std::map<std::string, std::uint64_t>;
	PlaylistRevisions CurrentPlaylistRevisions();
	std::uint64_t PlaylistRevision(const std::string &playlistId);

	void Notify(Kind kind);
	bool IsStopped();

private:
	class MessageHook;
	class PlaylistListener;
	class PlaylistManagerListener;

	void WatchPlaylist(IAIMPPlaylist *playlist);
	void PlayerChanged();
	void PlaylistChanged(const std::string &playlistId);
	void PlaylistRemoved(const std::string &playlistId);
	void AllPlaylistsChanged();
	void PollPlaylistSettings();

	IAIMPCore *FCore = nullptr;
	MessageHook *FMessageHook = nullptr;
	std::vector<PlaylistListener *> FPlaylistListeners;
	PlaylistManagerListener *FPlaylistManagerListener = nullptr;
	std::thread FSettingsPoller;

	std::mutex FMutex;
	std::condition_variable FChanged;
	std::uint64_t FVersions[KindCount] = {};
	PlaylistRevisions FPlaylistRevisions;
	// Its changes move the playing item's index, so they count as player changes too.
	std::string FPlayingPlaylistId;
	bool FStopped = false;
};
