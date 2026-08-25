#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

class EqualizerCommand : public IRemoteControlCommand
{
public:
	explicit EqualizerCommand(IAIMPCore *core) : FCore(core) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
};
