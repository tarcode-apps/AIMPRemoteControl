#include "queue.h"

#include <algorithm>
#include <map>
#include <set>
#include <utility>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiObjects.h"
#include "apiPlaylists.h"
#include "aimpHelper.h"
#include "playlistItemContext.h"

namespace
{
	using player::MutationResult;

	IAIMPPlaylistQueue *Queue(IAIMPCore *core)
	{
		return AcquireService<IAIMPPlaylistQueue>(core, IID_IAIMPPlaylistQueue);
	}

	IAIMPPlaylist *PlaylistOf(IAIMPPlaylistItem *item)
	{
		IAIMPPlaylist *playlist = nullptr;
		if (Failed(item->GetValueAsObject(AIMP_PLAYLISTITEM_PROPID_PLAYLIST, IID_IAIMPPlaylist, reinterpret_cast<void **>(&playlist))))
			return nullptr;
		return playlist;
	}

	std::int32_t IndexOf(IAIMPPlaylistItem *item)
	{
		INT32 index = 0;
		item->GetValueAsInt32(AIMP_PLAYLISTITEM_PROPID_INDEX, &index);
		return index;
	}

	// Names the track behind a queued item: the queue may hand out one object per
	// position even for one track.
	using TrackKey = std::pair<std::string, std::int32_t>;

	TrackKey TrackOf(IAIMPPlaylistItem *item)
	{
		IAIMPPlaylist *playlist = PlaylistOf(item);
		TrackKey key{GetPlaylistAIMPId(playlist), IndexOf(item)};
		if (playlist)
			playlist->Release();
		return key;
	}

	// Every position, for the caller to release; empty when one could not be read.
	std::vector<IAIMPPlaylistItem *> QueuedItems(IAIMPPlaylistQueue *queue)
	{
		std::vector<IAIMPPlaylistItem *> items;
		const INT32 count = queue->GetItemCount();
		for (INT32 i = 0; i < count; ++i)
		{
			IAIMPPlaylistItem *item = nullptr;
			if (Failed(queue->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			{
				for (IAIMPPlaylistItem *read : items)
					read->Release();
				return {};
			}
			items.push_back(item);
		}
		return items;
	}

	void ReleaseAll(const std::vector<IAIMPPlaylistItem *> &items)
	{
		for (IAIMPPlaylistItem *item : items)
			item->Release();
	}

	IAIMPPropertyList *QueueProperties(IAIMPPlaylistQueue *queue)
	{
		IAIMPPropertyList *props = nullptr;
		if (Failed(queue->QueryInterface(IID_IAIMPPropertyList, reinterpret_cast<void **>(&props))) || !props)
			return nullptr;
		return props;
	}

	bool IsSuspended(IAIMPPlaylistQueue *queue)
	{
		IAIMPPropertyList *props = QueueProperties(queue);
		if (!props)
			return false;
		INT32 suspended = 0;
		props->GetValueAsInt32(AIMP_PLAYLISTQUEUE_PROPID_SUSPENDED, &suspended);
		props->Release();
		return suspended != 0;
	}

	MutationResult ResultOf(HRESULT result)
	{
		return Succeeded(result) ? MutationResult::Ok : MutationResult::Failed;
	}
}

void player::VisitQueueItems(IAIMPCore *core, const QueueVisitor &visit)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return;
	IAIMPServiceFileURI *fileUriService = AcquireService<IAIMPServiceFileURI>(core, IID_IAIMPServiceFileURI);
	const INT32 count = queue->GetItemCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(queue->GetItem(i, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
			continue;
		IAIMPPlaylist *playlist = PlaylistOf(item);
		const PlaylistItemContext ctx(fileUriService, item);
		visit(ctx, playlist, IndexOf(item), i);
		if (playlist)
			playlist->Release();
		item->Release();
	}
	if (fileUriService)
		fileUriService->Release();
	queue->Release();
}

player::QueueSnapshot player::GetQueue(IAIMPCore *core)
{
	QueueSnapshot snapshot;
	if (IAIMPPlaylistQueue *queue = Queue(core))
	{
		snapshot.Suspended = IsSuspended(queue);
		queue->Release();
	}
	// The second line follows the item's own playlist, shown there or not: the
	// queue always has two lines.
	std::map<std::string, SecondLineFormatter> formatters;
	VisitQueueItems(core, [&](const PlaylistItemContext &ctx, IAIMPPlaylist *playlist, std::int32_t index, std::int32_t position)
					{
		QueueItem queued;
		queued.Position = position;
		queued.PlaylistId = GetPlaylistAIMPId(playlist);
		const SecondLineFormatter &secondLine = formatters.try_emplace(queued.PlaylistId, core, playlist, true).first->second;
		queued.Item = ReadPlaylistItem(ctx, index, secondLine);
		snapshot.Items.push_back(std::move(queued)); });
	return snapshot;
}

player::QueueState player::GetQueueState(IAIMPCore *core)
{
	QueueState state;
	if (IAIMPPlaylistQueue *queue = Queue(core))
	{
		state.Count = queue->GetItemCount();
		state.Suspended = IsSuspended(queue);
		queue->Release();
	}
	return state;
}

player::MutationResult player::EnqueueItems(IAIMPCore *core, const std::string &playlistId, const ItemSelection &selection, bool atBeginning)
{
	IAIMPPlaylist *playlist = LoadedPlaylistByAIMPId(core, playlistId);
	if (!playlist)
		return MutationResult::PlaylistNotFound;
	IAIMPObjectList *list = nullptr;
	HRESULT result = core->CreateObject(IID_IAIMPObjectList, reinterpret_cast<void **>(&list));
	bool found = Succeeded(result);
	if (found)
		found = VisitSelectedItems(core, playlist, selection, [&](const PlaylistItemContext &ctx, std::int32_t)
								   {
			if (Succeeded(result))
				result = list->Add(ctx.Item); });
	playlist->Release();

	if (found && Succeeded(result) && list->GetCount() > 0)
	{
		IAIMPPlaylistQueue *queue = Queue(core);
		result = queue ? queue->AddList(list, atBeginning) : E_FAIL;
		if (queue)
			queue->Release();
	}
	if (list)
		list->Release();
	return found ? ResultOf(result) : MutationResult::ItemNotFound;
}

player::MutationResult player::EnqueueItem(IAIMPCore *core, IAIMPPlaylistItem *item, bool atBeginning)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	const HRESULT result = queue->Add(item, atBeginning);
	queue->Release();
	return ResultOf(result);
}

player::MutationResult player::DequeueItem(IAIMPCore *core, IAIMPPlaylistItem *item)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	const HRESULT result = queue->Delete(item);
	queue->Release();
	return ResultOf(result);
}

// The player only deletes a track with all its positions, so the positions of the
// same tracks that are to stay are deleted along and put back where they were:
// added at the end and moved up, in queue order, so that every position before
// each one is already in place.
player::MutationResult player::RemoveQueueItems(IAIMPCore *core, std::vector<std::int32_t> positions)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	const std::vector<IAIMPPlaylistItem *> items = QueuedItems(queue);
	if (positions.empty() || !NormalizeIndexes(positions, static_cast<std::int32_t>(items.size())))
	{
		ReleaseAll(items);
		queue->Release();
		return MutationResult::ItemNotFound;
	}

	std::vector<TrackKey> tracks;
	for (IAIMPPlaylistItem *item : items)
		tracks.push_back(TrackOf(item));
	std::set<TrackKey> removedTracks;
	std::vector<IAIMPPlaylistItem *> removed;
	for (const std::int32_t position : positions)
		if (removedTracks.insert(tracks[position]).second)
			removed.push_back(items[position]);

	HRESULT result = S_OK;
	for (auto item = removed.begin(); Succeeded(result) && item != removed.end(); ++item)
		result = queue->Delete(*item);

	std::int32_t kept = 0;
	for (std::size_t position = 0; Succeeded(result) && position < items.size(); ++position)
	{
		if (std::binary_search(positions.begin(), positions.end(), static_cast<std::int32_t>(position)))
			continue;
		if (removedTracks.count(tracks[position]))
		{
			result = queue->Add(items[position], FALSE);
			if (Succeeded(result))
				result = queue->Move2(queue->GetItemCount() - 1, kept);
		}
		++kept;
	}

	ReleaseAll(items);
	queue->Release();
	return ResultOf(result);
}

// Each moved item goes straight to its final position: upwards from the first
// one, downwards from the last, so that the items still to move keep their
// positions until their turn.
player::MutationResult player::MoveQueueItems(IAIMPCore *core, std::vector<std::int32_t> positions, std::int32_t target)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	const std::int32_t count = queue->GetItemCount();
	const bool inside = NormalizeIndexes(positions, count);
	const std::int32_t moved = static_cast<std::int32_t>(positions.size());
	if (!inside || moved == 0 || target < 0 || target > count - moved)
	{
		queue->Release();
		return MutationResult::ItemNotFound;
	}

	HRESULT result = S_OK;
	if (target < positions.front())
		for (std::int32_t i = 0; Succeeded(result) && i < moved; ++i)
			result = queue->Move2(positions[i], target + i);
	else
		for (std::int32_t i = moved - 1; Succeeded(result) && i >= 0; --i)
			if (positions[i] != target + i)
				result = queue->Move2(positions[i], target + i);
	queue->Release();
	return ResultOf(result);
}

// The player deletes by playlist or by track, never the whole queue at once.
player::MutationResult player::ClearQueue(IAIMPCore *core)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	std::set<std::string> playlistIds;
	std::vector<IAIMPPlaylist *> playlists;
	for (IAIMPPlaylistItem *item : QueuedItems(queue))
	{
		if (IAIMPPlaylist *playlist = PlaylistOf(item))
		{
			if (playlistIds.insert(GetPlaylistAIMPId(playlist)).second)
				playlists.push_back(playlist);
			else
				playlist->Release();
		}
		item->Release();
	}
	HRESULT result = S_OK;
	for (IAIMPPlaylist *playlist : playlists)
	{
		if (Succeeded(result))
			result = queue->Delete2(playlist);
		playlist->Release();
	}
	// Items whose playlist is gone can only go one track at a time.
	while (Succeeded(result) && queue->GetItemCount() > 0)
	{
		IAIMPPlaylistItem *item = nullptr;
		if (Failed(queue->GetItem(0, IID_IAIMPPlaylistItem, reinterpret_cast<void **>(&item))) || !item)
		{
			result = E_FAIL;
			break;
		}
		const INT32 before = queue->GetItemCount();
		result = queue->Delete(item);
		if (Succeeded(result) && queue->GetItemCount() >= before)
			result = E_FAIL;
		item->Release();
	}
	queue->Release();
	return ResultOf(result);
}

player::MutationResult player::SetQueueSuspended(IAIMPCore *core, bool suspended)
{
	IAIMPPlaylistQueue *queue = Queue(core);
	if (!queue)
		return MutationResult::Failed;
	IAIMPPropertyList *props = QueueProperties(queue);
	const HRESULT result = props ? props->SetValueAsInt32(AIMP_PLAYLISTQUEUE_PROPID_SUSPENDED, suspended ? 1 : 0) : E_FAIL;
	if (props)
		props->Release();
	queue->Release();
	return ResultOf(result);
}
