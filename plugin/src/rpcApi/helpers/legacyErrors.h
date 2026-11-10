#pragma once

#include "apiErrors.h"
#include "player/playlistItems.h"

// The error codes of the frozen protocol (docs/remote-control-protocol.md,
// "Errors"); the app knows these and no others.
namespace rpcapi
{
	constexpr int ErrorSchedulerUnavailable = -1;
	constexpr int ErrorEnqueueFailed = 18;
	constexpr int ErrorDequeueFailed = 19;
	constexpr int ErrorPlaylistNotFound = 20;
	constexpr int ErrorTrackNotFound = 21;
	constexpr int ErrorCoverNotFound = 22;
	constexpr int ErrorAddFailed = 27;
	constexpr int ErrorRemoveFailed = 28;
	constexpr int ErrorRenameFailed = 29;
	constexpr int ErrorPlaylistCreationFailed = 30;
	constexpr int ErrorPlaylistRemoveFailed = 31;
	constexpr int ErrorPathInaccessible = 33;
	constexpr int ErrorLyricsNotAvailable = 35;

	// A code with the key of its message in [AIMPRemoteControlErrors].
	struct LegacyError
	{
		int Code;
		const char *Key;
	};

	// A player:: result as the protocol answers it: `notFound` for an unknown
	// playlist or track, `failed` for anything else that went wrong.
	inline void ThrowUnlessOk(player::MutationResult result, LegacyError notFound, LegacyError failed)
	{
		switch (result)
		{
		case player::MutationResult::Ok:
			return;
		case player::MutationResult::PlaylistNotFound:
		case player::MutationResult::ItemNotFound:
			throw LocalizedRpcError(notFound.Code, notFound.Key);
		default:
			throw LocalizedRpcError(failed.Code, failed.Key);
		}
	}
}
