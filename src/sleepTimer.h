#pragma once

#include <chrono>
#include <cstdint>
#include <condition_variable>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

class IAIMPCore;
class StateUpdateEvents;

class SleepTimer
{
public:
	struct State
	{
		bool Active = false;
		std::string Action;
		int ExpiresInSeconds = 0;
	};

	static const std::vector<std::string> &SupportedActions();
	static bool IsSupported(const std::string &action);

	SleepTimer();
	~SleepTimer();
	SleepTimer(const SleepTimer &) = delete;
	SleepTimer &operator=(const SleepTimer &) = delete;

	void Start(IAIMPCore *core, StateUpdateEvents &events);
	void Stop();

	State Get() const;
	void Set(const std::string &action, std::chrono::seconds delay);
	void Cancel();

private:
	void Run();
	void Execute(const std::string &action);

	IAIMPCore *FCore = nullptr;
	StateUpdateEvents *FEvents = nullptr;
	std::thread FThread;

	mutable std::mutex FMutex;
	std::condition_variable FChanged;
	bool FStopped = false;
	bool FActive = false;
	std::string FAction;
	std::chrono::steady_clock::time_point FDeadline;
	std::uint64_t FGeneration = 0; // bumped by Set() so a waiting Run() picks up a new deadline
};
