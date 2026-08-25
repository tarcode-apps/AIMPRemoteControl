#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <mutex>

class IAIMPCore;

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

	void Notify(Kind kind);
	bool IsStopped();

private:
	class MessageHook;
	class PlaylistListener;
	class PlaylistManagerListener;

	IAIMPCore *FCore = nullptr;
	MessageHook *FMessageHook = nullptr;
	PlaylistListener *FPlaylistListener = nullptr;
	PlaylistManagerListener *FPlaylistManagerListener = nullptr;

	std::mutex FMutex;
	std::condition_variable FChanged;
	std::uint64_t FVersions[KindCount] = {};
	bool FStopped = false;
};
