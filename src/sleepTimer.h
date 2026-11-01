#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <mutex>
#include <thread>
#include <vector>

class IAIMPCore;
class StateUpdateEvents;

// The plugin's own sleep timer. The player's scheduler is a separate plugin the
// SDK does not reach, so a timer set there is not seen here and the other way
// round.
class SleepTimer
{
public:
	enum class Action
	{
		PausePlayback,
		ClosePlayer,
		Shutdown,
		Sleep,
		Hibernate,
		Reboot,
		LogOff
	};

	// What brings the moment the actions run.
	enum class Trigger
	{
		After, // a delay from the moment the timer was set
		At,	   // a time of the wall clock
		TrackEnd,
		PlaylistEnd,
		QueueEnd
	};

	using Clock = std::chrono::system_clock;

	struct Request
	{
		std::vector<Action> Actions;
		Trigger When = Trigger::After;
		Clock::time_point ExpiresAt{}; // After, At
		bool WaitTrackEnd = false;	   // After, At: a track playing at that time finishes first
		int Tracks = 1;				   // TrackEnd: how many tracks are to end
	};

	struct State : Request
	{
		bool Active = false;
		Clock::time_point SetAt{};
		bool WaitingTrackEnd = false; // the time has come and the track still plays
		int TracksLeft = 0;			  // TrackEnd
		int TracksEnded = 0;		  // TrackEnd, PlaylistEnd, QueueEnd: since the timer was set
	};

	// The actions this computer can do, in a fixed order: sleep and hibernation only
	// where the system has them.
	static const std::vector<Action> &SupportedActions();
	static bool IsSupported(Action action);
	static bool IsTimed(Trigger when) { return when == Trigger::After || when == Trigger::At; }

	SleepTimer();
	~SleepTimer();
	SleepTimer(const SleepTimer &) = delete;
	SleepTimer &operator=(const SleepTimer &) = delete;

	void Start(IAIMPCore *core, StateUpdateEvents &events);
	void Stop();

	State Get() const;
	// Replaces the current timer, if any.
	void Set(const Request &request);
	void Cancel();

private:
	void Run();
	void StreamEnded(unsigned flags);
	void Fire(std::unique_lock<std::mutex> &lock, bool fromPlayerThread);

	IAIMPCore *FCore = nullptr;
	StateUpdateEvents *FEvents = nullptr;
	std::thread FThread;

	mutable std::mutex FMutex;
	std::condition_variable FChanged;
	bool FStopped = false;
	State FState;
	std::uint64_t FGeneration = 0; // bumped by every change, so a wait knows its timer is gone
};
