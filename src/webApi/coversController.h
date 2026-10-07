#pragma once

#include <optional>
#include <string>

#include "albumArt.h"
#include "apiController.h"
#include "helpers/coverIndex.h"

class IAIMPCore;
class IAIMPFileInfo;
class StateUpdateEvents;

namespace webapi
{
	// An item's cover URL redirects to the image by its hash, which the player
	// state carries directly for the playing track.
	class CoversController : public IApiController
	{
	public:
		CoversController(IAIMPCore *core, StateUpdateEvents &events, CoverIndex &covers)
			: FCore(core), FEvents(events), FCovers(covers) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		HttpContent ItemCover(const ApiRequest &request);
		HttpContent CoverByHash(const ApiRequest &request);
		std::optional<CoverLocator> PlayingCover(const std::string &hash);
		IAIMPFileInfo *FileInfoAt(const CoverLocator &locator);
		std::optional<albumArt::Cover> LoadAt(const CoverLocator &locator, const std::string &hash, bool original);

		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
	};
}
