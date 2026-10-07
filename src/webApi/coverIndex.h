#pragma once

#include <chrono>
#include <cstdint>
#include <deque>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <utility>

#include "player/coverSource.h"

class IAIMPCore;
class IAIMPFileInfo;

namespace webapi
{
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
		std::string HashFor(const player::CoverSource &source, std::uint64_t tagWrites, IAIMPFileInfo *fileInfo = nullptr);

		// Where the hash was last seen; nothing after a restart, until it is seen again.
		std::optional<player::CoverSource> SourceOf(const std::string &hash);

	private:
		// The oldest entries go when it is full; a lost entry only costs a lookup.
		template <typename V>
		class BoundedMap
		{
		public:
			const V *Find(const std::string &key) const
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
		BoundedMap<KnownHash> FHashes;					 // by cover key and tag writes
		BoundedMap<player::CoverSource> FSources;		 // by hash
		BoundedMap<std::uint64_t> FLoadedAtTagWrites; // by file name
	};
}
