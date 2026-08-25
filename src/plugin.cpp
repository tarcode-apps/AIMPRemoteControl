#include "plugin.h"
#include "pluginInfo.h"

#include <format>

#include "aimpHelper.h"
#include "apiMessages.h"
#include "mainThreadRunner.h"

#include "remoteControlCommands/addFilesCommand.h"
#include "remoteControlCommands/addUrlToPlaylistCommand.h"
#include "remoteControlCommands/browseFilesCommand.h"
#include "remoteControlCommands/createPlaylistCommand.h"
#include "remoteControlCommands/downloadTrackCommand.h"
#include "remoteControlCommands/enqueueTrackCommand.h"
#include "remoteControlCommands/equalizerCommand.h"
#include "remoteControlCommands/lyricsCommand.h"
#include "remoteControlCommands/playlistRenameCommand.h"
#include "remoteControlCommands/playlistRemoveCommand.h"
#include "remoteControlCommands/removeTrackCommand.h"
#include "remoteControlCommands/removeTrackFromPlayQueueCommand.h"
#include "remoteControlCommands/schedulerCommand.h"
#include "remoteControlCommands/getCoverCommand.h"
#include "remoteControlCommands/getFormatsCommand.h"
#include "remoteControlCommands/getPlayerControlPanelStateCommand.h"
#include "remoteControlCommands/getPlaylistEntriesCommand.h"
#include "remoteControlCommands/getPlaylistEntryInfoCommand.h"
#include "remoteControlCommands/getPlaylistsCommand.h"
#include "remoteControlCommands/getQueuedEntriesCommand.h"
#include "remoteControlCommands/pauseCommand.h"
#include "remoteControlCommands/playCommand.h"
#include "remoteControlCommands/playNextCommand.h"
#include "remoteControlCommands/playPreviousCommand.h"
#include "remoteControlCommands/pluginCapabilitiesCommand.h"
#include "remoteControlCommands/setTrackEnabledCommand.h"
#include "remoteControlCommands/setTrackRatingCommand.h"
#include "remoteControlCommands/showMessageCommand.h"
#include "remoteControlCommands/statusCommand.h"
#include "remoteControlCommands/subscribeOnAIMPStateUpdateEventCommand.h"
#include "remoteControlCommands/uploadTrackCommand.h"
#include "remoteControlCommands/versionCommand.h"

PChar WINAPI AIMPPlugin::InfoGet(INT32 Index)
{
	switch (Index)
	{
	case AIMP_PLUGIN_INFO_NAME:
		return TEXT(PLUGIN_NAME);
	case AIMP_PLUGIN_INFO_AUTHOR:
		return TEXT(PLUGIN_AUTHOR);
	case AIMP_PLUGIN_INFO_SHORT_DESCRIPTION:
		return TEXT(PLUGIN_DESCRIPTION);
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

	std::vector<std::unique_ptr<IRemoteControlCommand>> commands;
	commands.push_back(std::make_unique<VersionCommand>(Core));
	commands.push_back(std::make_unique<GetPlaylistsCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetQueuedEntriesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetPlaylistEntriesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetPlaylistEntryInfoCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetCoverCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetPlayerControlPanelStateCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<PauseCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<PlayCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<PlayNextCommand>(Core, FIdManager, FStateEvents));
	commands.push_back(std::make_unique<PlayPreviousCommand>(Core, FIdManager, FStateEvents));
	commands.push_back(std::make_unique<PluginCapabilitiesCommand>(FSettings));
	commands.push_back(std::make_unique<ShowMessageCommand>(Core));
	commands.push_back(std::make_unique<SetTrackRatingCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<SetTrackEnabledCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<EnqueueTrackCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<RemoveTrackCommand>(Core, FIdManager, FSettings));
	commands.push_back(std::make_unique<PlaylistRenameCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<CreatePlaylistCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<PlaylistRemoveCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<RemoveTrackFromPlayQueueCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<EqualizerCommand>(Core));
	commands.push_back(std::make_unique<LyricsCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<SchedulerCommand>(FSleepTimer, FSettings));
	commands.push_back(std::make_unique<DownloadTrackCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<GetFormatsCommand>(Core));
	commands.push_back(std::make_unique<BrowseFilesCommand>(Core, FSettings));
	commands.push_back(std::make_unique<AddFilesCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<AddUrlToPlaylistCommand>(Core, FIdManager));
	commands.push_back(std::make_unique<UploadTrackCommand>(Core, FIdManager, FSettings));
	commands.push_back(std::make_unique<StatusCommand>(Core));
	commands.push_back(std::make_unique<SubscribeOnAIMPStateUpdateEventCommand>(Core, FIdManager, FStateEvents, FSleepTimer));
	FRemoteControlServer = std::make_unique<AIMPRemoteControlServer>(std::move(commands), FNetworkWatcher);
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
