#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;
class SharedSettings;

class BrowseFilesCommand : public IRemoteControlCommand
{
public:
	BrowseFilesCommand(IAIMPCore *core, const SharedSettings &settings) : FCore(core), FSettings(settings) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	IAIMPCore *FCore;
	const SharedSettings &FSettings;
};
