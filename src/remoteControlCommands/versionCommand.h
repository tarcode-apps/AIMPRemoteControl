#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

class VersionCommand : public IRemoteControlCommand
{
public:
	explicit VersionCommand(IAIMPCore *core) : FCore(core) {}
	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
};
