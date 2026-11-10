#include "sleepTimer.h"

#include <algorithm>

#ifdef _WIN32
#include <windows.h>
#include <powrprof.h>
#endif

#include "apiCore.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "joinPumpingMessages.h"
#include "mainThreadRunner.h"
#include "stateUpdateEvents.h"

namespace
{
	// The timer sleeps in slices: the wall clock may be set, and a computer that
	// was suspended resumes with the moment passed.
	constexpr std::chrono::seconds WaitSlice{30};

	IAIMPServicePlayer *PlayerService(IAIMPCore *core)
	{
		IAIMPServicePlayer *player = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
			return player;
		return nullptr;
	}

	bool IsPlaying(IAIMPCore *core)
	{
		IAIMPServicePlayer *player = PlayerService(core);
		if (!player)
			return false;
		const bool playing = player->GetState() == AIMP_PLAYER_STATE_PLAYING;
		player->Release();
		return playing;
	}

	void PausePlayback(IAIMPCore *core)
	{
		if (IAIMPServicePlayer *player = PlayerService(core))
		{
			if (player->GetState() == AIMP_PLAYER_STATE_PLAYING)
				player->Pause();
			player->Release();
		}
	}

	DWORD MachineFlags(SleepTimer::Action action)
	{
		switch (action)
		{
		case SleepTimer::Action::Shutdown:
			return AIMP_SERVICE_SHUTDOWN_FLAGS_POWEROFF;
		case SleepTimer::Action::Reboot:
			return AIMP_SERVICE_SHUTDOWN_FLAGS_REBOOT;
		case SleepTimer::Action::LogOff:
			return AIMP_SERVICE_SHUTDOWN_FLAGS_LOGOFF;
		case SleepTimer::Action::Sleep:
			return AIMP_SERVICE_SHUTDOWN_FLAGS_SLEEP | AIMP_SERVICE_SHUTDOWN_FLAGS_NO_CONFIRM;
		case SleepTimer::Action::Hibernate:
			return AIMP_SERVICE_SHUTDOWN_FLAGS_HIBERNATE | AIMP_SERVICE_SHUTDOWN_FLAGS_NO_CONFIRM;
		default:
			return 0;
		}
	}

#ifdef _WIN32
	// Modern standby (S0 low-power idle) counts as sleep, which IsPwrSuspendAllowed
	// leaves out; hibernation needs its file as well as the state.
	void PowerStates(bool &sleep, bool &hibernate)
	{
		SYSTEM_POWER_CAPABILITIES capabilities{};
		if (!GetPwrCapabilities(&capabilities))
			return;
		sleep = capabilities.SystemS1 || capabilities.SystemS2 || capabilities.SystemS3 || capabilities.AoAc;
		hibernate = capabilities.SystemS4 && capabilities.HiberFilePresent;
	}
#endif

	// The player's thread. Pausing goes first, and the player takes one shutdown
	// call: a machine action leaves the player to the system, so closing it is
	// only asked for on its own.
	void Execute(IAIMPCore *core, const std::vector<SleepTimer::Action> &actions)
	{
		const auto has = [&](SleepTimer::Action action)
		{ return std::find(actions.begin(), actions.end(), action) != actions.end(); };
		if (has(SleepTimer::Action::PausePlayback))
			PausePlayback(core);
		DWORD flags = 0;
		for (const SleepTimer::Action action : actions)
			flags |= MachineFlags(action);
		if (!flags && has(SleepTimer::Action::ClosePlayer))
			flags = AIMP_SERVICE_SHUTDOWN_FLAGS_CLOSE_APP;
		if (!flags)
			return;
		IAIMPServiceShutdown *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceShutdown, reinterpret_cast<void **>(&service))) && service)
		{
			service->Shutdown(flags);
			service->Release();
		}
	}
}

const std::vector<SleepTimer::Action> &SleepTimer::SupportedActions()
{
	static const std::vector<Action> actions = []
	{
		bool sleep = false;
		bool hibernate = false;
#ifdef _WIN32
		PowerStates(sleep, hibernate);
#endif
		std::vector<Action> list{Action::PausePlayback, Action::ClosePlayer, Action::Shutdown};
		if (sleep)
			list.push_back(Action::Sleep);
		if (hibernate)
			list.push_back(Action::Hibernate);
		list.push_back(Action::Reboot);
		list.push_back(Action::LogOff);
		return list;
	}();
	return actions;
}

bool SleepTimer::IsSupported(Action action)
{
	const auto &actions = SupportedActions();
	return std::find(actions.begin(), actions.end(), action) != actions.end();
}

SleepTimer::SleepTimer() = default;

SleepTimer::~SleepTimer()
{
	Stop();
}

void SleepTimer::Start(IAIMPCore *core, StateUpdateEvents &events)
{
	FCore = core;
	FEvents = &events;
	FStopped = false;
	events.OnStreamEnd([this](unsigned flags)
					   { StreamEnded(flags); });
	FThread = std::thread([this]
						  { Run(); });
}

void SleepTimer::Stop()
{
	if (FEvents)
		FEvents->OnStreamEnd(nullptr);
	{
		std::lock_guard lock(FMutex);
		FStopped = true;
		FState.Active = false;
		++FGeneration;
	}
	FChanged.notify_all();
	JoinPumpingMessages(FThread);
	FCore = nullptr;
	FEvents = nullptr;
}

SleepTimer::State SleepTimer::Get() const
{
	std::lock_guard lock(FMutex);
	return FState;
}

void SleepTimer::Set(const Request &request)
{
	{
		std::lock_guard lock(FMutex);
		static_cast<Request &>(FState) = request;
		FState.Active = true;
		FState.SetAt = Clock::now();
		FState.WaitingTrackEnd = false;
		FState.TracksLeft = request.Tracks;
		FState.TracksEnded = 0;
		++FGeneration;
	}
	FChanged.notify_all();
	if (FEvents)
		FEvents->Notify(StateUpdateEvents::Timer);
}

void SleepTimer::Cancel()
{
	{
		std::lock_guard lock(FMutex);
		FState.Active = false;
		++FGeneration;
	}
	FChanged.notify_all();
	if (FEvents)
		FEvents->Notify(StateUpdateEvents::Timer);
}

void SleepTimer::Run()
{
	std::unique_lock lock(FMutex);
	while (!FStopped)
	{
		if (!FState.Active || !IsTimed(FState.When) || FState.WaitingTrackEnd)
		{
			FChanged.wait(lock);
			continue;
		}
		const std::uint64_t generation = FGeneration;
		const Clock::duration left = FState.ExpiresAt - Clock::now();
		if (left > Clock::duration::zero())
		{
			FChanged.wait_for(lock, std::min<Clock::duration>(left, WaitSlice), [&]
							  { return FStopped || FGeneration != generation; });
			continue;
		}
		if (FState.WaitTrackEnd)
		{
			// Asked without the lock: the player's thread takes it in StreamEnded().
			lock.unlock();
			const bool playing = RunOnMainThread(FCore, [&]
												 { return IsPlaying(FCore); });
			lock.lock();
			if (FGeneration != generation)
				continue;
			if (playing)
			{
				FState.WaitingTrackEnd = true;
				lock.unlock();
				FEvents->Notify(StateUpdateEvents::Timer);
				lock.lock();
				continue;
			}
		}
		Fire(lock, false);
	}
}

// The player's thread, on AIMP_MSG_EVENT_STREAM_END. A track's end counts
// however it came, by itself, a switch or a stop; the end of the playlist or of
// the queue is what the player says it was.
void SleepTimer::StreamEnded(unsigned flags)
{
	std::unique_lock lock(FMutex);
	if (!FState.Active)
		return;
	bool due = false;
	switch (FState.When)
	{
	case Trigger::TrackEnd:
		due = --FState.TracksLeft <= 0;
		break;
	case Trigger::PlaylistEnd:
		due = (flags & AIMP_MES_END_OF_PLAYLIST) != 0;
		break;
	case Trigger::QueueEnd:
		due = (flags & AIMP_MES_END_OF_QUEUE) != 0;
		break;
	default:
		due = FState.WaitingTrackEnd;
		break;
	}
	if (due)
		Fire(lock, true);
	else if (!IsTimed(FState.When))
	{
		++FState.TracksEnded;
		lock.unlock();
		FEvents->Notify(StateUpdateEvents::Timer);
	}
}

// Takes the lock held and gives it back held. On the player's thread the actions
// are posted: the player starts the next track right after the end of the
// stream, and a pause must find it playing.
void SleepTimer::Fire(std::unique_lock<std::mutex> &lock, bool fromPlayerThread)
{
	const std::vector<Action> actions = FState.Actions;
	FState.Active = false;
	++FGeneration;
	lock.unlock();
	if (fromPlayerThread)
		PostToMainThread(FCore, [core = FCore, actions]
						 { Execute(core, actions); });
	else
		RunOnMainThread(FCore, [&]
						{ Execute(FCore, actions); });
	FEvents->Notify(StateUpdateEvents::Timer);
	lock.lock();
}
