#pragma once

#include <chrono>
#include <cstdint>
#include <deque>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "player/coverSource.h"

class IAIMPCore;
class IAIMPFileInfo;

namespace webapi
{
	// Where a cover was seen: a file, and the playlist item it was read through
	// when there was one. The player finds some covers only for an item, by the
	// artist and album in its own cache, and not for the bare file.
	struct CoverLocator
	{
		player::CoverSource Source;
		std::string PlaylistId;
		std::int32_t Index = -1;
	};

	// Covers are served by the hash of their bytes, so that the tracks of an album
	// share one image in the browser's cache. This is what the plugin knows about
	// them: not the images, only how to find them again. Callable from any thread.
	class CoverIndex
	{
	public:
		explicit CoverIndex(IAIMPCore *core) : FCore(core) {}

		// The hash of the cover, loaded through the player when it is not known yet;
		// empty without a cover. `tagWrites` is the playlist's count of tag writes, after
		// which the file is read again. Takes the file info when the caller has it.
		std::string HashFor(const CoverLocator &locator, std::uint64_t tagWrites, IAIMPFileInfo *fileInfo = nullptr);

		// Where the hash was seen, the latest first; nothing after a restart, until it
		// is seen again.
		std::vector<CoverLocator> LocatorsOf(const std::string &hash);

	private:
		// The oldest entries go when it is full; a lost entry only costs a lookup.
		template <typename V>
		class BoundedMap
		{
		public:
			V *Find(const std::string &key)
			{
				const auto it = FEntries.find(key);
				return it == FEntries.end() ? nullptr : &it->second;
			}

			void Put(const std::string &key, V value)
			{
				if (!FEntries.insert_or_assign(key, std::move(value)).second)
					return;
				FOrder.push_back(key);
				if (FOrder.size() > Capacity)
				{
					FEntries.erase(FOrder.front());
					FOrder.pop_front();
				}
			}

		private:
			static constexpr std::size_t Capacity = 65536;
			std::map<std::string, V> FEntries;
			std::deque<std::string> FOrder;
		};

		struct KnownHash
		{
			std::string Hash; // empty for no cover
			std::chrono::steady_clock::time_point At;
		};

		bool ReadAgainAt(const std::string &fileName, std::uint64_t tagWrites);

		IAIMPCore *FCore;
		std::mutex FMutex;
		BoundedMap<KnownHash> FHashes;						// by cover key and tag writes
		BoundedMap<std::vector<CoverLocator>> FLocators; // by hash
		BoundedMap<std::uint64_t> FLoadedAtTagWrites;		// by file name
	};
}
