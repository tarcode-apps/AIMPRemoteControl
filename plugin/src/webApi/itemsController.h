#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;
class StateUpdateEvents;

namespace webapi
{
	// What is done to a selection of items, which may lie in several playlists.
	class ItemsController : public IApiController
	{
	public:
		ItemsController(IAIMPCore *core, StateUpdateEvents &events, const SharedSettings &settings)
			: FCore(core), FEvents(events), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		const SharedSettings &FSettings;
	};
}
