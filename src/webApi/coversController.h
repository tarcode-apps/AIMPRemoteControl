#pragma once

#include <optional>
#include <string>

#include "apiController.h"
#include "player/coverSource.h"

class IAIMPCore;
class StateUpdateEvents;

namespace webapi
{
	class CoverIndex;

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
		std::optional<player::CoverSource> PlayingCoverSource(const std::string &hash);

		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		CoverIndex &FCovers;
	};
}
