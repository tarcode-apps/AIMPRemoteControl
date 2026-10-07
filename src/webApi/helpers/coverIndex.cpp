#include "coverIndex.h"

#include <algorithm>

#include "albumArt.h"
#include "apiFileManager.h"
#include "mainThreadRunner.h"
#include "player/covers.h"

namespace
{
	// A cover beside the file may be replaced without the file changing; the player
	// notices that in its own time, and the plugin asks it again this often.
	constexpr std::chrono::minutes KnownFor{10};
	// Locators kept per hash: the tracks of an album all lead to the same image.
	constexpr std::size_t LocatorsPerHash = 4;

	bool SamePlace(const webapi::CoverLocator &a, const webapi::CoverLocator &b)
	{
		return a.Source.FileName == b.Source.FileName && a.PlaylistId == b.PlaylistId && a.Index == b.Index;
	}
}

std::string webapi::CoverIndex::HashFor(const CoverLocator &locator, std::uint64_t tagWrites, IAIMPFileInfo *fileInfo)
{
	const std::string memoKey = player::CoverKey(locator.Source) + '/' + std::to_string(tagWrites);
	{
		std::lock_guard lock(FMutex);
		if (const KnownHash *known = FHashes.Find(memoKey); known && std::chrono::steady_clock::now() - known->At <= KnownFor)
			return known->Hash;
	}

	IAIMPFileInfo *info = fileInfo;
	if (!info)
		info = RunOnMainThread(FCore, [&]
							   { return player::ResolveCoverFileInfo(FCore, locator.Source); });
	if (!info)
		return {};
	const unsigned flags = ReadAgainAt(locator.Source.FileName, tagWrites) ? albumArt::Refresh : 0;
	const std::optional<albumArt::Cover> cover = albumArt::LoadCover(FCore, info, flags);
	if (!fileInfo)
		info->Release();
	const std::string hash = cover ? albumArt::ContentHash(*cover) : std::string();

	std::lock_guard lock(FMutex);
	FHashes.Put(memoKey, KnownHash{hash, std::chrono::steady_clock::now()});
	if (!hash.empty())
	{
		std::vector<CoverLocator> locators;
		if (const std::vector<CoverLocator> *known = FLocators.Find(hash))
			locators = *known;
		std::erase_if(locators, [&](const CoverLocator &known)
					  { return SamePlace(known, locator); });
		locators.insert(locators.begin(), locator);
		if (locators.size() > LocatorsPerHash)
			locators.resize(LocatorsPerHash);
		FLocators.Put(hash, std::move(locators));
	}
	return hash;
}

std::vector<webapi::CoverLocator> webapi::CoverIndex::LocatorsOf(const std::string &hash)
{
	std::lock_guard lock(FMutex);
	const std::vector<CoverLocator> *locators = FLocators.Find(hash);
	return locators ? *locators : std::vector<CoverLocator>();
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
