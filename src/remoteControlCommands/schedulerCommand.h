#pragma once

#include "remoteControlCommand.h"

class SharedSettings;
class SleepTimer;

class SchedulerCommand : public IRemoteControlCommand
{
public:
	SchedulerCommand(SleepTimer &timer, const SharedSettings &settings) : FTimer(timer), FSettings(settings) {}

	void Register(IRpcRegistrar &rpc) override;

	static nlohmann::json BuildTimerState(const SleepTimer &timer);

private:
	SleepTimer &FTimer;
	const SharedSettings &FSettings;
};
