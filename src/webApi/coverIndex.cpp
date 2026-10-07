#include "coverIndex.h"

#include "albumArt.h"
#include "apiFileManager.h"
#include "mainThreadRunner.h"
#include "player/covers.h"

namespace
{
	// A cover beside the file may be replaced without the file changing; the player
	// notices that in its own time, and the plugin asks it again this often.
	constexpr std::chrono::minutes KnownFor{10};
}

std::string webapi::CoverIndex::HashFor(const player::CoverSource &source, std::uint64_t tagWrites, IAIMPFileInfo *fileInfo)
{
	const std::string memoKey = player::CoverKey(source) + '/' + std::to_string(tagWrites);
	{
		std::lock_guard lock(FMutex);
		if (const KnownHash *known = FHashes.Find(memoKey); known && std::chrono::steady_clock::now() - known->At <= KnownFor)
			return known->Hash;
	}

	IAIMPFileInfo *info = fileInfo;
	if (!info)
		info = RunOnMainThread(FCore, [&]
							   { return player::ResolveCoverFileInfo(FCore, source); });
	if (!info)
		return {};
	const unsigned flags = ReadAgainAt(source.FileName, tagWrites) ? albumArt::Refresh : 0;
	const std::optional<albumArt::Cover> cover = albumArt::LoadCover(FCore, info, flags);
	if (!fileInfo)
		info->Release();
	const std::string hash = cover ? albumArt::ContentHash(*cover) : std::string();

	std::lock_guard lock(FMutex);
	FHashes.Put(memoKey, KnownHash{hash, std::chrono::steady_clock::now()});
	if (!hash.empty())
		FSources.Put(hash, source);
	return hash;
}

std::optional<player::CoverSource> webapi::CoverIndex::SourceOf(const std::string &hash)
{
	std::lock_guard lock(FMutex);
	const player::CoverSource *source = FSources.Find(hash);
	if (!source)
		return std::nullopt;
	return *source;
}

// Whether tags were written since the file's cover was last loaded: the player's
// own copy may be stale then, and the file is read again once.
bool webapi::CoverIndex::ReadAgainAt(const std::string &fileName, std::uint64_t tagWrites)
{
	std::lock_guard lock(FMutex);
	const std::uint64_t *loadedAt = FLoadedAtTagWrites.Find(fileName);
	const bool stale = loadedAt && *loadedAt < tagWrites;
	FLoadedAtTagWrites.Put(fileName, tagWrites);
	return stale;
}
