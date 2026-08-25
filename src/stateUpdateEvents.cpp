#include "stateUpdateEvents.h"

#include "apiCore.h"
#include "apiMessages.h"
#include "apiPlaylists.h"
#include "IUnknownImpl.h"

class StateUpdateEvents::MessageHook : public IUnknownImpl<IAIMPMessageHook>
{
public:
	explicit MessageHook(StateUpdateEvents &owner) : FOwner(owner) {}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPMessageHook); }

	void WINAPI CoreMessage(DWORD message, INT32 param1, void *, HRESULT *) override
	{
		switch (message)
		{
		case AIMP_MSG_EVENT_PLAYER_STATE:
		case AIMP_MSG_EVENT_STREAM_START:
		case AIMP_MSG_EVENT_STREAM_START_SUBTRACK:
		case AIMP_MSG_EVENT_STREAM_END:
		case AIMP_MSG_EVENT_PLAYING_FILE_INFO:
			FOwner.Notify(ControlPanel);
			break;
		case AIMP_MSG_EVENT_PROPERTY_VALUE:
			switch (param1)
			{
			case AIMP_MSG_PROPERTY_VOLUME:
			case AIMP_MSG_PROPERTY_MUTE:
			case AIMP_MSG_PROPERTY_REPEAT:
			case AIMP_MSG_PROPERTY_SHUFFLE:
			case AIMP_MSG_PROPERTY_RADIOCAP:
			case AIMP_MSG_PROPERTY_PLAYER_POSITION:
				FOwner.Notify(ControlPanel);
				break;
			default:
				break;
			}
			break;
		case AIMP_MSG_EVENT_PLAYBACK_QUEUE:
			FOwner.Notify(Queue);
			break;
		default:
			break;
		}
	}

private:
	StateUpdateEvents &FOwner;
};

class StateUpdateEvents::PlaylistListener : public IUnknownImpl<IAIMPPlaylistListener>
{
public:
	explicit PlaylistListener(StateUpdateEvents &owner) : FOwner(owner) {}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPPlaylistListener); }

	void WINAPI Activated() override {}
	void WINAPI Changed(DWORD flags) override
	{
		if (flags & (AIMP_PLAYLIST_NOTIFY_NAME | AIMP_PLAYLIST_NOTIFY_CONTENT | AIMP_PLAYLIST_NOTIFY_FILEINFO |
					 AIMP_PLAYLIST_NOTIFY_READONLY | AIMP_PLAYLIST_NOTIFY_PLAYINGSWITCHS))
			FOwner.Notify(Playlists);
	}
	void WINAPI Removed() override { FOwner.Notify(Playlists); }

private:
	StateUpdateEvents &FOwner;
};

class StateUpdateEvents::PlaylistManagerListener : public IUnknownImpl<IAIMPExtensionPlaylistManagerListener>
{
public:
	PlaylistManagerListener(StateUpdateEvents &owner, PlaylistListener *listener) : FOwner(owner), FListener(listener) {}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPExtensionPlaylistManagerListener); }

	void WINAPI PlaylistActivated(IAIMPPlaylist *) override {}
	void WINAPI PlaylistAdded(IAIMPPlaylist *playlist) override
	{
		playlist->ListenerAdd(FListener);
		FOwner.Notify(Playlists);
	}
	void WINAPI PlaylistRemoved(IAIMPPlaylist *) override { FOwner.Notify(Playlists); }

private:
	StateUpdateEvents &FOwner;
	PlaylistListener *FListener;
};

StateUpdateEvents::StateUpdateEvents() = default;

StateUpdateEvents::~StateUpdateEvents()
{
	Stop();
}

void StateUpdateEvents::Start(IAIMPCore *core)
{
	FCore = core;
	FStopped = false;

	FMessageHook = new MessageHook(*this);
	FMessageHook->AddRef();
	IAIMPServiceMessageDispatcher *dispatcher = nullptr;
	if (Succeeded(core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))) && dispatcher)
	{
		dispatcher->Hook(FMessageHook);
		dispatcher->Release();
	}

	FPlaylistListener = new PlaylistListener(*this);
	FPlaylistListener->AddRef();
	FPlaylistManagerListener = new PlaylistManagerListener(*this, FPlaylistListener);
	FPlaylistManagerListener->AddRef();
	core->RegisterExtension(IID_IAIMPServicePlaylistManager, FPlaylistManagerListener);

	IAIMPServicePlaylistManager *mgr = nullptr;
	if (Succeeded(core->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) && mgr)
	{
		const INT32 count = mgr->GetLoadedPlaylistCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPPlaylist *playlist = nullptr;
			if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
			{
				playlist->ListenerAdd(FPlaylistListener);
				playlist->Release();
			}
		}
		mgr->Release();
	}
}

void StateUpdateEvents::Stop()
{
	{
		std::lock_guard lock(FMutex);
		FStopped = true;
	}
	FChanged.notify_all();

	if (!FCore)
		return;

	if (FMessageHook)
	{
		IAIMPServiceMessageDispatcher *dispatcher = nullptr;
		if (Succeeded(FCore->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))) && dispatcher)
		{
			dispatcher->Unhook(FMessageHook);
			dispatcher->Release();
		}
		FMessageHook->Release();
		FMessageHook = nullptr;
	}

	if (FPlaylistListener)
	{
		IAIMPServicePlaylistManager *mgr = nullptr;
		if (Succeeded(FCore->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) && mgr)
		{
			const INT32 count = mgr->GetLoadedPlaylistCount();
			for (INT32 i = 0; i < count; ++i)
			{
				IAIMPPlaylist *playlist = nullptr;
				if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
				{
					playlist->ListenerRemove(FPlaylistListener);
					playlist->Release();
				}
			}
			mgr->Release();
		}
	}
	if (FPlaylistManagerListener)
	{
		FCore->UnregisterExtension(FPlaylistManagerListener);
		FPlaylistManagerListener->Release();
		FPlaylistManagerListener = nullptr;
	}
	if (FPlaylistListener)
	{
		FPlaylistListener->Release();
		FPlaylistListener = nullptr;
	}
	FCore = nullptr;
}

bool StateUpdateEvents::Wait(Kind kind, std::chrono::milliseconds timeout)
{
	std::unique_lock lock(FMutex);
	const std::uint64_t seen = FVersions[kind];
	return FChanged.wait_for(lock, timeout, [&]
							 { return FStopped || FVersions[kind] != seen; }) &&
		   !FStopped;
}

void StateUpdateEvents::Notify(Kind kind)
{
	{
		std::lock_guard lock(FMutex);
		++FVersions[kind];
	}
	FChanged.notify_all();
}

bool StateUpdateEvents::IsStopped()
{
	std::lock_guard lock(FMutex);
	return FStopped;
}
