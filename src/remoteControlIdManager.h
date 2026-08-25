#pragma once

#include <cstdint>
#include <shared_mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>

struct PlaylistItemKey
{
	std::string AIMPPlaylistId;
	std::int32_t Index = 0;

	bool operator==(const PlaylistItemKey &) const = default;
};

struct PlaylistItemKeyHash
{
	std::size_t operator()(const PlaylistItemKey &k) const noexcept
	{
		const std::size_t h1 = std::hash<std::string>{}(k.AIMPPlaylistId);
		const std::size_t h2 = std::hash<std::int32_t>{}(k.Index);
		return h1 ^ (h2 + 0x9E3779B9u + (h1 << 6) + (h1 >> 2));
	}
};

class RemoteControlIdManager
{
public:
	std::int32_t PlaylistGetOrGeneratePluginId(const std::string &aimpPlaylistId);
	std::string PlaylistGetKey(std::int32_t pluginId) const;
	void PlaylistRemoveByKey(const std::string &aimpPlaylistId);

	std::int32_t PlaylistItemGetOrGeneratePluginId(
		const std::string &aimpPlaylistId, std::int32_t aimpPlaylistIndex);
	PlaylistItemKey PlaylistItemGetKey(std::int32_t pluginId) const;
	void PlaylistItemsRemoveByPlaylistKey(const std::string &aimpPlaylistId);

private:
	void PlaylistRemoveByKeyUnlocked(const std::string &aimpPlaylistId);
	void PlaylistItemsRemoveByPlaylistKeyUnlocked(const std::string &aimpPlaylistId);

	mutable std::shared_mutex FMutex;

	std::unordered_map<std::string, std::int32_t> FPlaylistByAIMPId;
	std::unordered_map<std::int32_t, std::string> FPlaylistByPluginId;

	std::unordered_map<PlaylistItemKey, std::int32_t, PlaylistItemKeyHash> FItemByAIMPKey;
	std::unordered_map<std::int32_t, PlaylistItemKey> FItemByPluginId;
	std::unordered_map<std::string, std::unordered_set<std::int32_t>> FItemsByPlaylist;
};
