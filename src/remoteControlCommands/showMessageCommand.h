#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

class ShowMessageCommand : public IRemoteControlCommand
{
public:
	explicit ShowMessageCommand(IAIMPCore *core) : FCore(core) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
};
