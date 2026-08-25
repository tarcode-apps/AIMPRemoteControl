#pragma once

#include "remoteControlCommand.h"

class SharedSettings;

class PluginCapabilitiesCommand : public IRemoteControlCommand
{
public:
	explicit PluginCapabilitiesCommand(const SharedSettings &settings) : FSettings(settings) {}

	void Register(IRpcRegistrar &rpc) override;

private:
	const SharedSettings &FSettings;
};
