#include "sleepTimer.h"

#include <algorithm>
#include <cmath>

#ifdef _WIN32
#include <windows.h>
#include <powrprof.h>
#endif

#include "apiCore.h"
#include "apiPlayer.h"
#include "joinPumpingMessages.h"
#include "mainThreadRunner.h"
#include "stateUpdateEvents.h"

namespace
{
	const char *const ActionPlayerShutdown = "player_shutdown";
	const char *const ActionPausePlayback = "pause_playback";
	const char *const ActionMachineShutdown = "machine_shutdown";
	const char *const ActionMachineSleep = "machine_sleep";
	const char *const ActionMachineHibernate = "machine_hibernate";

	void PausePlayback(IAIMPCore *core)
	{
		IAIMPServicePlayer *player = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
		{
			if (player->GetState() == AIMP_PLAYER_STATE_PLAYING)
				player->Pause();
			player->Release();
		}
	}

	void Shutdown(IAIMPCore *core, DWORD flags)
	{
		IAIMPServiceShutdown *service = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServiceShutdown, reinterpret_cast<void **>(&service))) && service)
		{
			service->Shutdown(flags);
			service->Release();
		}
	}
}

const std::vector<std::string> &SleepTimer::SupportedActions()
{
	static const std::vector<std::string> actions = []
	{
		std::vector<std::string> list{ActionPlayerShutdown, ActionPausePlayback, ActionMachineShutdown};
#ifdef _WIN32
		if (IsPwrSuspendAllowed())
			list.push_back(ActionMachineSleep);
		if (IsPwrHibernateAllowed())
			list.push_back(ActionMachineHibernate);
#endif
		return list;
	}();
	return actions;
}

bool SleepTimer::IsSupported(const std::string &action)
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
	FThread = std::thread([this]
						  { Run(); });
}

void SleepTimer::Stop()
{
	{
		std::lock_guard lock(FMutex);
		FStopped = true;
		FActive = false;
	}
	FChanged.notify_all();
	JoinPumpingMessages(FThread);
	FCore = nullptr;
	FEvents = nullptr;
}

SleepTimer::State SleepTimer::Get() const
{
	std::lock_guard lock(FMutex);
	State state;
	state.Active = FActive;
	if (FActive)
	{
		state.Action = FAction;
		const auto left = std::chrono::duration<double>(FDeadline - std::chrono::steady_clock::now()).count();
		state.ExpiresInSeconds = static_cast<int>(std::max(0.0, std::round(left)));
	}
	return state;
}

void SleepTimer::Set(const std::string &action, std::chrono::seconds delay)
{
	{
		std::lock_guard lock(FMutex);
		FActive = true;
		FAction = action;
		FDeadline = std::chrono::steady_clock::now() + delay;
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
		FActive = false;
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
		if (!FActive)
		{
			FChanged.wait(lock, [&]
						  { return FStopped || FActive; });
			continue;
		}
		const std::uint64_t generation = FGeneration;
		if (FChanged.wait_until(lock, FDeadline, [&]
								{ return FStopped || !FActive || FGeneration != generation; }))
			continue; // cancelled, replaced or stopping: re-evaluate
		if (std::chrono::steady_clock::now() < FDeadline)
			continue; // spurious wake-up
		const std::string action = FAction;
		FActive = false;
		lock.unlock();
		Execute(action);
		if (FEvents)
			FEvents->Notify(StateUpdateEvents::Timer);
		lock.lock();
	}
}

void SleepTimer::Execute(const std::string &action)
{
	if (action == ActionPausePlayback)
	{
		RunOnMainThread(FCore, [&]
						{ PausePlayback(FCore); });
		return;
	}
	DWORD flags = 0;
	if (action == ActionPlayerShutdown)
		flags = AIMP_SERVICE_SHUTDOWN_FLAGS_CLOSE_APP;
	else if (action == ActionMachineShutdown)
		flags = AIMP_SERVICE_SHUTDOWN_FLAGS_POWEROFF;
	else if (action == ActionMachineSleep)
		flags = AIMP_SERVICE_SHUTDOWN_FLAGS_SLEEP | AIMP_SERVICE_SHUTDOWN_FLAGS_NO_CONFIRM;
	else if (action == ActionMachineHibernate)
		flags = AIMP_SERVICE_SHUTDOWN_FLAGS_HIBERNATE | AIMP_SERVICE_SHUTDOWN_FLAGS_NO_CONFIRM;
	else
		return;
	RunOnMainThread(FCore, [&]
					{ Shutdown(FCore, flags); });
}
