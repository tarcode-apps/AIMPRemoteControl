#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class RemoteControlIdManager;

class LyricsCommand : public IRemoteControlCommand
{
public:
	LyricsCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
		: FCore(core), FIdManager(idManager) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	RemoteControlIdManager &FIdManager;
};
