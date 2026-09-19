#include "remoteControlIdManager.h"

#include <mutex>

#include "crc32.h"

std::int32_t RemoteControlIdManager::PlaylistGetOrGeneratePluginId(const std::string &aimpPlaylistId)
{
	{
		std::shared_lock readLock(FMutex);
		if (auto existing = FPlaylistByAIMPId.find(aimpPlaylistId); existing != FPlaylistByAIMPId.end())
			return existing->second;
	}

	std::unique_lock writeLock(FMutex);

	if (auto existing = FPlaylistByAIMPId.find(aimpPlaylistId); existing != FPlaylistByAIMPId.end())
		return existing->second;

	std::int32_t pluginId = static_cast<std::int32_t>(Crc32Update(0, aimpPlaylistId.data(), aimpPlaylistId.size()) & 0x7fffffff);
	while (pluginId == 0 || FPlaylistByPluginId.count(pluginId))
		++pluginId;
	FPlaylistByAIMPId.emplace(aimpPlaylistId, pluginId);
	FPlaylistByPluginId.emplace(pluginId, aimpPlaylistId);
	return pluginId;
}

std::string RemoteControlIdManager::PlaylistGetKey(std::int32_t pluginId) const
{
	std::shared_lock readLock(FMutex);

	if (auto found = FPlaylistByPluginId.find(pluginId); found != FPlaylistByPluginId.end())
		return found->second;
	return {};
}

void RemoteControlIdManager::PlaylistRemoveByKey(const std::string &aimpPlaylistId)
{
	std::unique_lock writeLock(FMutex);

	PlaylistItemsRemoveByPlaylistKeyUnlocked(aimpPlaylistId);
	PlaylistRemoveByKeyUnlocked(aimpPlaylistId);
}

std::int32_t RemoteControlIdManager::PlaylistItemGetOrGeneratePluginId(
	const std::string &aimpPlaylistId, std::int32_t aimpPlaylistIndex)
{
	const PlaylistItemKey key{aimpPlaylistId, aimpPlaylistIndex};

	{
		std::shared_lock readLock(FMutex);
		if (auto existing = FItemByAIMPKey.find(key); existing != FItemByAIMPKey.end())
			return existing->second;
	}

	std::unique_lock writeLock(FMutex);

	if (auto existing = FItemByAIMPKey.find(key); existing != FItemByAIMPKey.end())
		return existing->second;

	const std::string seed = aimpPlaylistId + ":" + std::to_string(aimpPlaylistIndex);
	std::int32_t pluginId = static_cast<std::int32_t>(Crc32Update(0, seed.data(), seed.size()) & 0x7fffffff);
	while (pluginId == 0 || FItemByPluginId.count(pluginId))
		++pluginId;
	FItemByAIMPKey.emplace(key, pluginId);
	FItemByPluginId.emplace(pluginId, key);
	FItemsByPlaylist[aimpPlaylistId].insert(pluginId);
	return pluginId;
}

PlaylistItemKey RemoteControlIdManager::PlaylistItemGetKey(std::int32_t pluginId) const
{
	std::shared_lock readLock(FMutex);

	if (auto found = FItemByPluginId.find(pluginId); found != FItemByPluginId.end())
		return found->second;
	return {};
}

void RemoteControlIdManager::PlaylistItemsRemoveByPlaylistKey(const std::string &aimpPlaylistId)
{
	std::unique_lock writeLock(FMutex);

	PlaylistItemsRemoveByPlaylistKeyUnlocked(aimpPlaylistId);
}

void RemoteControlIdManager::PlaylistRemoveByKeyUnlocked(const std::string &aimpPlaylistId)
{
	if (auto found = FPlaylistByAIMPId.find(aimpPlaylistId); found != FPlaylistByAIMPId.end())
	{
		FPlaylistByPluginId.erase(found->second);
		FPlaylistByAIMPId.erase(found);
	}
}

void RemoteControlIdManager::PlaylistItemsRemoveByPlaylistKeyUnlocked(const std::string &aimpPlaylistId)
{
	auto playlistGroup = FItemsByPlaylist.find(aimpPlaylistId);
	if (playlistGroup == FItemsByPlaylist.end())
		return;

	for (const std::int32_t pluginId : playlistGroup->second)
	{
		if (auto entry = FItemByPluginId.find(pluginId); entry != FItemByPluginId.end())
		{
			FItemByAIMPKey.erase(entry->second);
			FItemByPluginId.erase(entry);
		}
	}
	FItemsByPlaylist.erase(playlistGroup);
}
