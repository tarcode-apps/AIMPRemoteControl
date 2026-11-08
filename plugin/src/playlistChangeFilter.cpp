#include "playlistChangeFilter.h"

#include <algorithm>
#include <optional>
#include <utility>
#include <vector>

#include "apiPlaylists.h"
#include "joinPumpingMessages.h"

namespace
{
	// The player's notifications come up to 90 ms before the track start and a
	// little after it; the window leaves room for a slow disk.
	constexpr std::chrono::milliseconds Window{500};
	constexpr std::size_t StartsKept = 16;
}

PlaylistChangeFilter::PlaylistChangeFilter(Apply apply) : FApply(std::move(apply)), FThread([this]
																							 { Run(); }) {}

PlaylistChangeFilter::~PlaylistChangeFilter()
{
	{
		std::lock_guard lock(FMutex);
		FStopped = true;
		FPending.clear();
	}
	FWake.notify_all();
	JoinPumpingMessages(FThread);
}

void PlaylistChangeFilter::Forget(const std::string &playlistId)
{
	std::lock_guard lock(FMutex);
	FPending.erase(playlistId);
	FStarts.erase(playlistId);
	FItemCounts.erase(playlistId);
}

void PlaylistChangeFilter::TrackStarted(const std::string &playlistId)
{
	std::lock_guard lock(FMutex);
	std::deque<Clock::time_point> &starts = FStarts[playlistId];
	starts.push_back(Clock::now());
	if (starts.size() > StartsKept)
		starts.pop_front();
}

void PlaylistChangeFilter::Changed(const std::string &playlistId, unsigned long flags, std::int32_t itemCount)
{
	const bool tagsWritten = (flags & AIMP_PLAYLIST_NOTIFY_FILEINFO) != 0;
	const auto now = Clock::now();
	std::unique_lock lock(FMutex);
	// A changed item count is a real change whatever the moment.
	const auto count = FItemCounts.find(playlistId);
	const bool grewOrShrank = count != FItemCounts.end() && count->second != itemCount;
	FItemCounts[playlistId] = itemCount;
	// Statistics follow the start, so they can be told apart at once; content and
	// file info precede it and have to wait for it.
	const bool decidable = grewOrShrank || !(flags & (AIMP_PLAYLIST_NOTIFY_CONTENT | AIMP_PLAYLIST_NOTIFY_FILEINFO));
	if (decidable)
	{
		const bool byPlayer = !grewOrShrank && StartedNear(playlistId, now);
		lock.unlock();
		if (!byPlayer)
			FApply(playlistId, tagsWritten);
		return;
	}
	FPending.try_emplace(playlistId, Pending{now}).first->second.TagsWritten |= tagsWritten;
	lock.unlock();
	FWake.notify_all();
}

bool PlaylistChangeFilter::StartedNear(const std::string &playlistId, Clock::time_point at) const
{
	const auto starts = FStarts.find(playlistId);
	return starts != FStarts.end() &&
		   std::any_of(starts->second.begin(), starts->second.end(), [&](Clock::time_point start)
					   { return std::chrono::abs(start - at) < Window; });
}

// Sleeps until the earliest pending notification has waited its window out, or
// until there is one; nothing wakes it while there is nothing to do.
void PlaylistChangeFilter::Run()
{
	while (true)
	{
		std::vector<std::pair<std::string, bool>> changed; // playlist, tags written
		{
			std::unique_lock lock(FMutex);
			while (!FStopped && changed.empty())
			{
				const auto now = Clock::now();
				std::optional<Clock::time_point> next;
				for (auto it = FPending.begin(); it != FPending.end();)
				{
					const Clock::time_point deadline = it->second.At + Window;
					if (deadline > now)
					{
						next = next ? std::min(*next, deadline) : deadline;
						++it;
						continue;
					}
					if (!StartedNear(it->first, it->second.At))
						changed.emplace_back(it->first, it->second.TagsWritten);
					it = FPending.erase(it);
				}
				if (changed.empty())
				{
					if (next)
						FWake.wait_until(lock, *next);
					else
						FWake.wait(lock);
				}
			}
			if (FStopped)
				return;
		}
		for (const auto &[playlistId, tagsWritten] : changed)
			FApply(playlistId, tagsWritten);
	}
}
