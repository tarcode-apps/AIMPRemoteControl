#include "coversController.h"

#include "apiErrors.h"

#include <optional>
#include <string>
#include <utility>

#include "albumArt.h"
#include "apiFileManager.h"
#include "helpers/coverIndex.h"
#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/covers.h"
#include "player/playerState.h"
#include "stateUpdateEvents.h"

namespace
{
	// The redirect is never reused: a stale one would lead to an image the plugin has
	// not seen since a restart, and asking is cheap. The image is named by its bytes,
	// so it never goes stale.
	constexpr const char *NoStore = "no-store";
	constexpr const char *ImageCaching = "private, max-age=31536000, immutable";

	// Without a size the image is the copy the player holds, already scaled down to
	// its own limit; the original is the image as found in the tags or the folder.
	struct Variant
	{
		int Size = 0; // 0 for the player's copy
		bool Original = false;

		std::string Query() const
		{
			if (Original)
				return "?size=original";
			return Size ? "?size=" + std::to_string(Size) : "";
		}
	};

	Variant CoverVariant(const ApiRequest &request)
	{
		if (webapi::QueryString(request, "size") == "original")
			return {0, true};
		return {webapi::QueryInt(request, "size", 0, 1, INT32_MAX), false};
	}

	ApiError NotFound()
	{
		return ApiError(404, "coverNotFound");
	}
}

void webapi::CoversController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapGet(R"(/api/v1/playlists/([^/]+)/items/(\d+)/cover)", [this](const ApiRequest &request) -> std::optional<HttpContent>
					 { return ItemCover(request); });
	endpoints.MapGet(R"(/api/v1/covers/([0-9a-f]{32}))", [this](const ApiRequest &request) -> std::optional<HttpContent>
					 { return CoverByHash(request); });
}

HttpContent webapi::CoversController::ItemCover(const ApiRequest &request)
{
	const std::string &playlistId = request.PathMatches.at(0);
	const std::optional<std::int32_t> index = ParseInt32(request.PathMatches.at(1));
	if (!index)
		throw ApiError(404, "itemNotFound");
	const std::string key = QueryString(request, "key");
	if (key.empty())
		throw ApiError(400, "invalidQuery");
	const Variant variant = CoverVariant(request);

	// Read before the item, so that tags written in between make the lookup look
	// older, never newer, than the cover.
	const std::uint64_t tagWrites = FEvents.TagWrites(playlistId);
	player::CoverTarget target;
	ThrowUnlessOk(RunOnMainThread(FCore, [&]
								  { return player::GetCoverTarget(FCore, playlistId, *index, target); }));
	std::string hash;
	if (player::CoverKey(target.Source) == key)
		hash = FCovers.HashFor(CoverLocator{target.Source, playlistId, *index}, tagWrites, target.FileInfo);
	target.FileInfo->Release();
	if (hash.empty())
		throw NotFound();

	HttpContent redirect;
	redirect.Status = 302;
	redirect.Headers["Location"] = "/api/v1/covers/" + hash + variant.Query();
	redirect.Headers["Cache-Control"] = NoStore;
	return redirect;
}

// A client may hold the playing track's hash from before a restart, with the image
// gone from its cache, and ask for it before it reads the state again. That cover
// can always be found.
std::optional<webapi::CoverLocator> webapi::CoversController::PlayingCover(const std::string &hash)
{
	const player::PlayerState state = RunOnMainThread(FCore, [&]
													  { return player::GetPlayerState(FCore); });
	if (!state.Track)
		return std::nullopt;
	const CoverLocator playing{state.Track->Cover, state.Track->PlaylistId, state.Track->Index};
	if (FCovers.HashFor(playing, FEvents.TagWrites(state.Track->PlaylistId)) != hash)
		return std::nullopt;
	return playing;
}

// The file info the cover was seen through: the playlist item's while the item is
// still that file, otherwise one for the file alone. Released by the caller.
IAIMPFileInfo *webapi::CoversController::FileInfoAt(const CoverLocator &locator)
{
	return RunOnMainThread(FCore, [&]() -> IAIMPFileInfo *
						   {
		if (locator.Index >= 0)
		{
			player::CoverTarget target;
			if (player::GetCoverTarget(FCore, locator.PlaylistId, locator.Index, target) == player::MutationResult::Ok)
			{
				if (player::CoverKey(target.Source) == player::CoverKey(locator.Source))
					return target.FileInfo;
				target.FileInfo->Release();
			}
		}
		return player::ResolveCoverFileInfo(FCore, locator.Source); });
}

// The image with this hash as the locator finds it now; nothing when the cover
// there has changed since, which is a different hash.
std::optional<albumArt::Cover> webapi::CoversController::LoadAt(const CoverLocator &locator, const std::string &hash, bool original)
{
	IAIMPFileInfo *fileInfo = FileInfoAt(locator);
	if (!fileInfo)
		return std::nullopt;
	std::optional<albumArt::Cover> cover = albumArt::LoadCover(FCore, fileInfo);
	if (cover && albumArt::ContentHash(*cover) != hash)
		cover.reset();
	else if (cover && original)
		cover = albumArt::LoadCover(FCore, fileInfo, albumArt::Original);
	fileInfo->Release();
	return cover;
}

HttpContent webapi::CoversController::CoverByHash(const ApiRequest &request)
{
	const std::string &hash = request.PathMatches.at(0);
	const Variant variant = CoverVariant(request);
	std::optional<albumArt::Cover> cover;
	for (const CoverLocator &locator : FCovers.LocatorsOf(hash))
		if ((cover = LoadAt(locator, hash, variant.Original)))
			break;
	if (!cover)
		if (const std::optional<CoverLocator> playing = PlayingCover(hash))
			cover = LoadAt(*playing, hash, variant.Original);
	if (cover && variant.Size)
		cover = albumArt::ScaleCover(FCore, *cover, variant.Size);
	if (!cover)
		throw NotFound();

	HttpContent image;
	image.ContentType = cover->ContentType;
	image.Body = std::move(cover->Body);
	image.Headers["Cache-Control"] = ImageCaching;
	return image;
}
