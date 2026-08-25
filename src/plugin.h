#pragma once

#include "apiPlugin.h"
#include "IUnknownImpl.h"
#include "networkWatcher.h"
#include "optionsFrame.h"
#include "remoteControlIdManager.h"
#include "remoteControlServer.h"
#include "serviceDiscoveryServer.h"
#include "sleepTimer.h"
#include "stateUpdateEvents.h"

#include <memory>

class AIMPPlugin : public IUnknownImpl<IAIMPPlugin>
{
public:
	PChar WINAPI InfoGet(INT32 Index) override;
	DWORD WINAPI InfoGetCategories() override;
	HRESULT WINAPI Initialize(IAIMPCore *Core) override;
	HRESULT WINAPI Finalize() override;
	void WINAPI SystemNotification(INT32 NotifyID, IUnknown *Data) override;

private:
	IAIMPCore *FCore = nullptr;
	OptionsFrame *FOptionsFrame = nullptr;
	AIMPServiceDiscoveryServer FDiscoveryServer;
	std::unique_ptr<AIMPRemoteControlServer> FRemoteControlServer;
	RemoteControlIdManager FIdManager;
	SharedSettings FSettings;
	NetworkWatcher FNetworkWatcher;
	StateUpdateEvents FStateEvents;
	SleepTimer FSleepTimer;
};

// Export
#if defined(_MSC_VER)
// Exported through plugin.def, which is what keeps the name undecorated in
// 32-bit builds; dllexport here would add a second, decorated entry.
#define PLUGIN_EXPORT
#elif defined(_WIN32)
#define PLUGIN_EXPORT __declspec(dllexport)
#else
#define PLUGIN_EXPORT __attribute__((visibility("default")))
#endif

extern "C" PLUGIN_EXPORT HRESULT WINAPI AIMPPluginGetHeader(IAIMPPlugin **Header);
