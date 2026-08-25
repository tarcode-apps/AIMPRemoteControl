#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

class StatusCommand : public IRemoteControlCommand
{
public:
	explicit StatusCommand(IAIMPCore *core) : FCore(core) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
};
