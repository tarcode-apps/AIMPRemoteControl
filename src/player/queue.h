#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

#include "playlistItems.h"

class IAIMPCore;
class IAIMPPlaylist;
class IAIMPPlaylistItem;
class PlaylistItemContext;

namespace player
{
	// The playback queue holds playlist items, the same item as many times as it
	// was added, so a queued item is named by its position.
	struct QueueItem
	{
		std::int32_t Position = 0;
		std::string PlaylistId;
		PlaylistItem Item;
	};

	struct QueueSnapshot
	{
		bool Suspended = false;
		std::vector<QueueItem> Items;
	};

	struct QueueState
	{
		std::int32_t Count = 0;
		bool Suspended = false;
	};

	// `playlist` may be null when the item's playlist is gone.
	using QueueVisitor = std::function<void(const PlaylistItemContext &ctx, IAIMPPlaylist *playlist, std::int32_t index,
											std::int32_t position)>;

	void VisitQueueItems(IAIMPCore *core, const QueueVisitor &visit);
	QueueSnapshot GetQueue(IAIMPCore *core);
	QueueState GetQueueState(IAIMPCore *core);

	// Adds the selected items of a playlist, in playlist order, to the end or the
	// beginning of the queue.
	MutationResult EnqueueItems(IAIMPCore *core, const std::string &playlistId, const ItemSelection &selection, bool atBeginning);
	MutationResult EnqueueItem(IAIMPCore *core, IAIMPPlaylistItem *item, bool atBeginning);

	// Takes every position of the item out of the queue.
	MutationResult DequeueItem(IAIMPCore *core, IAIMPPlaylistItem *item);

	// Takes the items at `positions` out; other positions of the same tracks stay.
	MutationResult RemoveQueueItems(IAIMPCore *core, std::vector<std::int32_t> positions);

	// Moves the items at `positions` to `target`, the position the first of them
	// gets in the resulting queue. They keep their relative order.
	MutationResult MoveQueueItems(IAIMPCore *core, std::vector<std::int32_t> positions, std::int32_t target);

	MutationResult ClearQueue(IAIMPCore *core);

	// A suspended queue is kept but not played from.
	MutationResult SetQueueSuspended(IAIMPCore *core, bool suspended);
}
