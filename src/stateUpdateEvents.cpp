#include "stateUpdateEvents.h"

#include <algorithm>

#include "apiCore.h"
#include "apiMessages.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "IUnknownImpl.h"
#include "joinPumpingMessages.h"
#include "mainThreadRunner.h"
#include "player/playerState.h"
#include "player/playlists.h"

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
			FOwner.PlayerChanged();
			break;
		case AIMP_MSG_EVENT_PROPERTY_VALUE:
			switch (param1)
			{
			case AIMP_MSG_PROPERTY_VOLUME:
			case AIMP_MSG_PROPERTY_MUTE:
			case AIMP_MSG_PROPERTY_REPEAT:
			case AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST:
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
		// View and formatting settings of playlists live in the options and have no
		// playlist-level notification, so any options change counts for every playlist.
		case AIMP_MSG_EVENT_OPTIONS:
			FOwner.AllPlaylistsChanged();
			break;
		default:
			break;
		}
	}

private:
	StateUpdateEvents &FOwner;
};

// One listener per playlist: AIMP's Changed() carries no playlist, so the listener
// itself is what tells the playlists apart. The playlist reference is dropped in
// Removed(), the listener object itself only at Stop(), because AIMP may still be
// walking its listener list while Removed() runs.
class StateUpdateEvents::PlaylistListener : public IUnknownImpl<IAIMPPlaylistListener>
{
public:
	PlaylistListener(StateUpdateEvents &owner, IAIMPPlaylist *playlist)
		: FOwner(owner), FPlaylist(playlist), FId(GetPlaylistAIMPId(playlist))
	{
		FPlaylist->AddRef();
	}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPPlaylistListener); }

	void WINAPI Activated() override {}
	void WINAPI Changed(DWORD flags) override
	{
		if (flags & (AIMP_PLAYLIST_NOTIFY_NAME | AIMP_PLAYLIST_NOTIFY_CONTENT | AIMP_PLAYLIST_NOTIFY_FILEINFO |
					 AIMP_PLAYLIST_NOTIFY_READONLY | AIMP_PLAYLIST_NOTIFY_PLAYINGSWITCHS | AIMP_PLAYLIST_NOTIFY_STATISTICS |
					 AIMP_PLAYLIST_NOTIFY_GROUPNAME))
			FOwner.PlaylistChanged(FId);
	}
	void WINAPI Removed() override
	{
		ReleasePlaylist();
		FOwner.PlaylistRemoved(FId);
	}

	void Attach() { FPlaylist->ListenerAdd(this); }

	void Detach()
	{
		if (FPlaylist)
			FPlaylist->ListenerRemove(this);
		ReleasePlaylist();
	}

	const std::string &Id() const { return FId; }

private:
	void ReleasePlaylist()
	{
		if (FPlaylist)
			FPlaylist->Release();
		FPlaylist = nullptr;
	}

	StateUpdateEvents &FOwner;
	IAIMPPlaylist *FPlaylist;
	std::string FId;
};

class StateUpdateEvents::PlaylistManagerListener : public IUnknownImpl<IAIMPExtensionPlaylistManagerListener>
{
public:
	explicit PlaylistManagerListener(StateUpdateEvents &owner) : FOwner(owner) {}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPExtensionPlaylistManagerListener); }

	void WINAPI PlaylistActivated(IAIMPPlaylist *) override {}
	void WINAPI PlaylistAdded(IAIMPPlaylist *playlist) override { FOwner.WatchPlaylist(playlist); }
	void WINAPI PlaylistRemoved(IAIMPPlaylist *) override { FOwner.Notify(Playlists); }

private:
	StateUpdateEvents &FOwner;
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

	FPlaylistManagerListener = new PlaylistManagerListener(*this);
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
				WatchPlaylist(playlist);
				playlist->Release();
			}
		}
		mgr->Release();
	}

	FSettingsPoller = std::thread([this]
								  { PollPlaylistSettings(); });
}

void StateUpdateEvents::Stop()
{
	{
		std::lock_guard lock(FMutex);
		FStopped = true;
	}
	FChanged.notify_all();
	JoinPumpingMessages(FSettingsPoller);

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

	if (FPlaylistManagerListener)
	{
		FCore->UnregisterExtension(FPlaylistManagerListener);
		FPlaylistManagerListener->Release();
		FPlaylistManagerListener = nullptr;
	}
	for (PlaylistListener *listener : FPlaylistListeners)
	{
		listener->Detach();
		listener->Release();
	}
	FPlaylistListeners.clear();
	{
		std::lock_guard lock(FMutex);
		FPlaylistRevisions.clear();
	}
	FCore = nullptr;
}

void StateUpdateEvents::WatchPlaylist(IAIMPPlaylist *playlist)
{
	PlaylistListener *listener = new PlaylistListener(*this, playlist);
	listener->AddRef();
	listener->Attach();
	FPlaylistListeners.push_back(listener);
	{
		std::lock_guard lock(FMutex);
		FPlaylistRevisions[listener->Id()] = 1;
	}
	Notify(Playlists);
}

// Called from the player's own thread, where the playing playlist can be read.
void StateUpdateEvents::PlayerChanged()
{
	const std::string playing = player::PlayingPlaylistId(FCore);
	{
		std::lock_guard lock(FMutex);
		FPlayingPlaylistId = playing;
	}
	Notify(ControlPanel);
}

void StateUpdateEvents::PlaylistChanged(const std::string &playlistId)
{
	{
		std::lock_guard lock(FMutex);
		++FPlaylistRevisions[playlistId];
		++FVersions[Playlists];
		if (playlistId == FPlayingPlaylistId)
			++FVersions[ControlPanel];
	}
	FChanged.notify_all();
}

void StateUpdateEvents::PlaylistRemoved(const std::string &playlistId)
{
	{
		std::lock_guard lock(FMutex);
		FPlaylistRevisions.erase(playlistId);
	}
	Notify(Playlists);
}

void StateUpdateEvents::AllPlaylistsChanged()
{
	{
		std::lock_guard lock(FMutex);
		for (auto &[id, revision] : FPlaylistRevisions)
			++revision;
	}
	Notify(Playlists);
}

StateUpdateEvents::PlaylistRevisions StateUpdateEvents::CurrentPlaylistRevisions()
{
	std::lock_guard lock(FMutex);
	return FPlaylistRevisions;
}

std::uint64_t StateUpdateEvents::PlaylistRevision(const std::string &playlistId)
{
	std::lock_guard lock(FMutex);
	const auto it = FPlaylistRevisions.find(playlistId);
	return it == FPlaylistRevisions.end() ? 0 : it->second;
}

bool StateUpdateEvents::Wait(Kind kind, std::chrono::milliseconds timeout)
{
	std::unique_lock lock(FMutex);
	const std::uint64_t seen = FVersions[kind];
	return FChanged.wait_for(lock, timeout, [&]
							 { return FStopped || FVersions[kind] != seen; }) &&
		   !FStopped;
}

StateUpdateEvents::Versions StateUpdateEvents::Current()
{
	std::lock_guard lock(FMutex);
	Versions versions;
	std::copy(std::begin(FVersions), std::end(FVersions), versions.begin());
	return versions;
}

std::bitset<StateUpdateEvents::KindCount> StateUpdateEvents::WaitAny(Versions &seen, std::chrono::milliseconds timeout)
{
	std::bitset<KindCount> changed;
	std::unique_lock lock(FMutex);
	const bool moved = FChanged.wait_for(lock, timeout, [&]
										 {
											 if (FStopped)
												 return true;
											 for (int kind = 0; kind < KindCount; ++kind)
												 if (FVersions[kind] != seen[kind])
													 return true;
											 return false; });
	if (!moved || FStopped)
		return changed;
	for (int kind = 0; kind < KindCount; ++kind)
		if (FVersions[kind] != seen[kind])
		{
			seen[kind] = FVersions[kind];
			changed.set(kind);
		}
	return changed;
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

// The player sends nothing when a playlist's view, formatting or grouping settings
// change, so they are compared on a timer instead.
void StateUpdateEvents::PollPlaylistSettings()
{
	constexpr std::chrono::seconds Interval{2};
	std::map<std::string, std::string> known;
	while (true)
	{
		{
			std::unique_lock lock(FMutex);
			if (FChanged.wait_for(lock, Interval, [&]
								  { return FStopped; }))
				return;
		}
		const std::map<std::string, std::string> current = RunOnMainThread(FCore, [&]
																			  {
			std::map<std::string, std::string> snapshots;
			IAIMPServicePlaylistManager *mgr = nullptr;
			if (Succeeded(FCore->QueryInterface(IID_IAIMPServicePlaylistManager, reinterpret_cast<void **>(&mgr))) && mgr)
			{
				const INT32 count = mgr->GetLoadedPlaylistCount();
				for (INT32 i = 0; i < count; ++i)
				{
					IAIMPPlaylist *playlist = nullptr;
					if (Succeeded(mgr->GetLoadedPlaylist(i, &playlist)) && playlist)
					{
						snapshots[GetPlaylistAIMPId(playlist)] = player::SettingsSnapshot(playlist);
						playlist->Release();
					}
				}
				mgr->Release();
			}
			return snapshots; });
		for (const auto &[id, snapshot] : current)
		{
			const auto seen = known.find(id);
			if (seen != known.end() && seen->second != snapshot)
				PlaylistChanged(id);
		}
		known = current;
	}
}
