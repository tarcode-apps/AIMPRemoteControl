#pragma once

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <functional>
#include <map>
#include <mutex>
#include <string>
#include <thread>

// Starting a track makes the player move its cursor, write what it learnt from the
// decoder into the item and count the play, which raise the content, file info and
// statistics notifications of the playlist as editing it or its tags does, with no
// flag of their own. The filter holds such notifications back until it can tell: one
// within a moment of a track start is the player's own and is dropped, unless the
// item count shows the content really changed. Everything else is passed on.
//
// Self-contained so that it can be removed once the player tells its own changes
// apart. Callable from any thread; the hand-over runs on the filter's thread.
class PlaylistChangeFilter
{
public:
	using Apply = std::function<void(const std::string &playlistId, bool tagsWritten)>;

	explicit PlaylistChangeFilter(Apply apply);
	~PlaylistChangeFilter();
	PlaylistChangeFilter(const PlaylistChangeFilter &) = delete;
	PlaylistChangeFilter &operator=(const PlaylistChangeFilter &) = delete;

	void Forget(const std::string &playlistId);
	void TrackStarted(const std::string &playlistId);
	// Content, file info and statistics flags of IAIMPPlaylistListener.Changed, with
	// the playlist's item count at that moment.
	void Changed(const std::string &playlistId, unsigned long flags, std::int32_t itemCount);

private:
	using Clock = std::chrono::steady_clock;

	struct Pending
	{
		Clock::time_point At;
		bool TagsWritten = false;
	};

	void Run();
	bool StartedNear(const std::string &playlistId, Clock::time_point at) const;

	Apply FApply;
	std::mutex FMutex;
	std::condition_variable FWake;
	bool FStopped = false;
	std::map<std::string, Pending> FPending;
	// Tracks may follow each other faster than the notifications are resolved.
	std::map<std::string, std::deque<Clock::time_point>> FStarts;
	std::map<std::string, std::int32_t> FItemCounts;
	std::thread FThread;
};
