#pragma once

#include "apiController.h"

class IAIMPCore;
class SharedSettings;
class StateUpdateEvents;

namespace webapi
{
	class PlaylistsController : public IApiController
	{
	public:
		PlaylistsController(IAIMPCore *core, StateUpdateEvents &events, const SharedSettings &settings)
			: FCore(core), FEvents(events), FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

	private:
		IAIMPCore *FCore;
		StateUpdateEvents &FEvents;
		const SharedSettings &FSettings;
	};
}
