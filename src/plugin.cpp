#include "plugin.h"
#include "pluginInfo.h"

#include <format>

#include "aimpHelper.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "mainThreadRunner.h"

#include "rpcApi/addFilesCommand.h"
#include "rpcApi/addUrlToPlaylistCommand.h"
#include "rpcApi/browseFilesCommand.h"
#include "rpcApi/createPlaylistCommand.h"
#include "rpcApi/downloadTrackCommand.h"
#include "rpcApi/enqueueTrackCommand.h"
#include "rpcApi/equalizerCommand.h"
#include "rpcApi/lyricsCommand.h"
#include "rpcApi/playlistRenameCommand.h"
#include "rpcApi/playlistRemoveCommand.h"
#include "rpcApi/removeTrackCommand.h"
#include "rpcApi/removeTrackFromPlayQueueCommand.h"
#include "rpcApi/schedulerCommand.h"
#include "rpcApi/getCoverCommand.h"
#include "rpcApi/getFormatsCommand.h"
#include "rpcApi/getPlayerControlPanelStateCommand.h"
#include "rpcApi/getPlaylistEntriesCommand.h"
#include "rpcApi/getPlaylistEntryInfoCommand.h"
#include "rpcApi/getPlaylistsCommand.h"
#include "rpcApi/getQueuedEntriesCommand.h"
#include "rpcApi/pauseCommand.h"
#include "rpcApi/playCommand.h"
#include "rpcApi/playNextCommand.h"
#include "rpcApi/playPreviousCommand.h"
#include "rpcApi/pluginCapabilitiesCommand.h"
#include "rpcApi/setTrackEnabledCommand.h"
#include "rpcApi/setTrackRatingCommand.h"
#include "rpcApi/showMessageCommand.h"
#include "rpcApi/statusCommand.h"
#include "rpcApi/stopCommand.h"
#include "rpcApi/subscribeOnAIMPStateUpdateEventCommand.h"
#include "rpcApi/uploadTrackCommand.h"
#include "rpcApi/versionCommand.h"
#include "webApi/eventsController.h"
#include "webApi/playlistsController.h"

namespace
{
	bool HasService(IAIMPCore *core, REFIID iid)
	{
		IUnknown *service = nullptr;
		if (Failed(core->QueryInterface(iid, reinterpret_cast<void **>(&service))) || !service)
			return false;
		service->Release();
		return true;
	}
}

PChar WINAPI AIMPPlugin::InfoGet(INT32 Index)
{
	switch (Index)
	{
	case AIMP_PLUGIN_INFO_NAME:
		return const_cast<PChar>(TEXT(PLUGIN_NAME));
	case AIMP_PLUGIN_INFO_AUTHOR:
		return const_cast<PChar>(TEXT(PLUGIN_AUTHOR));
	case AIMP_PLUGIN_INFO_SHORT_DESCRIPTION:
		return const_cast<PChar>(TEXT(PLUGIN_DESCRIPTION));
	default:
		return nullptr;
	}
}

DWORD WINAPI AIMPPlugin::InfoGetCategories()
{
	return AIMP_PLUGIN_CATEGORY_ADDONS;
}

HRESULT WINAPI AIMPPlugin::Initialize(IAIMPCore *Core)
{
	if (!HasService(Core, IID_IAIMPServicePlayer) ||
		!HasService(Core, IID_IAIMPServicePlaylistManager) ||
		!HasService(Core, IID_IAIMPServiceMessageDispatcher))
		return E_FAIL;

	FCore = Core;
	FSettings.Set(Settings::Load(Core));
	FNetworkWatcher.SetExcludedInterfaces(FSettings.Get().Network.ExcludedInterfaces);
	FOptionsFrame = new OptionsFrame(Core, [this](const Settings &s)
									 {
		FSettings.Set(s);
		FNetworkWatcher.SetExcludedInterfaces(s.Network.ExcludedInterfaces);
		if (FRemoteControlServer)
			FRemoteControlServer->ApplySettings(s); });
	FOptionsFrame->AddRef();

	if (Failed(Core->RegisterExtension(IID_IAIMPServiceOptionsDialog, FOptionsFrame)))
	{
		FOptionsFrame->Release();
		FOptionsFrame = nullptr;
		return E_FAIL;
	}
	
	FStateEvents.Start(Core);
	FSleepTimer.Start(Core, FStateEvents);
	FDiscoveryServer.Start(FNetworkWatcher);

	std::vector<std::unique_ptr<IApiController>> commands;
	commands.push_back(std::make_unique<rpcapi::VersionCommand>(Core));
	commands.push_back(std::make_unique<rpcapi::GetPlaylistsCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetQueuedEntriesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetPlaylistEntriesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetPlaylistEntryInfoCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetCoverCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetPlayerControlPanelStateCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::PauseCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::StopCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::PlayCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::PlayNextCommand>(Core, FIdManager, FStateEvents));
	commands.push_back(std::make_unique<rpcapi::PlayPreviousCommand>(Core, FIdManager, FStateEvents));
	commands.push_back(std::make_unique<rpcapi::PluginCapabilitiesCommand>(FSettings));
	commands.push_back(std::make_unique<rpcapi::ShowMessageCommand>(Core));
	commands.push_back(std::make_unique<rpcapi::SetTrackRatingCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::SetTrackEnabledCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::EnqueueTrackCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::RemoveTrackCommand>(Core, FIdManager, FSettings));
	commands.push_back(std::make_unique<rpcapi::PlaylistRenameCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::CreatePlaylistCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::PlaylistRemoveCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::RemoveTrackFromPlayQueueCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::EqualizerCommand>(Core));
	commands.push_back(std::make_unique<rpcapi::LyricsCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::SchedulerCommand>(FSleepTimer, FSettings));
	commands.push_back(std::make_unique<rpcapi::DownloadTrackCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::GetFormatsCommand>(Core));
	commands.push_back(std::make_unique<rpcapi::BrowseFilesCommand>(Core, FSettings));
	commands.push_back(std::make_unique<rpcapi::AddFilesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::AddUrlToPlaylistCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<rpcapi::UploadTrackCommand>(Core, FIdManager, FSettings));
	commands.push_back(std::make_unique<rpcapi::StatusCommand>(Core));
	commands.push_back(std::make_unique<rpcapi::SubscribeOnAIMPStateUpdateEventCommand>(Core, FIdManager, FStateEvents, FSleepTimer));
	commands.push_back(std::make_unique<webapi::PlaylistsController>(Core, FStateEvents));
	commands.push_back(std::make_unique<webapi::EventsController>(FStateEvents));
	FRemoteControlServer = std::make_unique<AIMPRemoteControlServer>(std::move(commands), FNetworkWatcher,
		[core = FCore](const std::string &keyPath)
		{
			return RunOnMainThread(core, [&]
								   { return Localize(core, keyPath, keyPath); });
		});
	FRemoteControlServer->OnBindFailure([core = FCore](const std::string &address, unsigned short port)
		{
			PostToMainThread(core, [core, endpoint = address + ":" + std::to_string(port)]
							 {
				const std::string text = std::vformat(
					Localize(core, "AIMPRemoteControlMessages\\PortInUse",
							 "Remote Control: cannot listen on {0} - the port is in use by another program"),
					std::make_format_args(endpoint));
				IAIMPServiceMessageDispatcher *dispatcher = nullptr;
				if (Failed(core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))) || !dispatcher)
					return;
				if (IAIMPString *s = StringToIAIMPString(core, text))
				{
					dispatcher->Send(AIMP_MSG_CMD_SHOW_NOTIFICATION, 0, s->GetData());
					s->Release();
				}
				dispatcher->Release(); }); });
	FRemoteControlServer->ApplySettings(FSettings.Get());
	FRemoteControlServer->Start();
	FNetworkWatcher.Start();
	return S_OK;
}

HRESULT WINAPI AIMPPlugin::Finalize()
{
	FNetworkWatcher.Stop();
	FSleepTimer.Stop();
	FStateEvents.Stop();
	if (FRemoteControlServer)
	{
		FRemoteControlServer->Stop();
		FRemoteControlServer.reset();
	}
	FDiscoveryServer.Stop();
	if (FOptionsFrame)
	{
		FCore->UnregisterExtension(FOptionsFrame);
		FOptionsFrame->Release();
		FOptionsFrame = nullptr;
	}
	FCore = nullptr;
	return S_OK;
}

void WINAPI AIMPPlugin::SystemNotification(INT32 NotifyID, IUnknown *Data)
{
	// no-op
}

// --- Export function ---

extern "C" PLUGIN_EXPORT HRESULT WINAPI AIMPPluginGetHeader(IAIMPPlugin **Header)
{
	*Header = new AIMPPlugin();
	(*Header)->AddRef();
	return S_OK;
}
