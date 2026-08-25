#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

class GetFormatsCommand : public IRemoteControlCommand
{
public:
	explicit GetFormatsCommand(IAIMPCore *core) : FCore(core) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
};
