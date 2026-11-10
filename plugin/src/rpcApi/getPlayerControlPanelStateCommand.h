#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

class IAIMPCore;
class IAIMPPlaylistItem;
class RemoteControlIdManager;

namespace rpcapi
{
	class GetPlayerControlPanelStateCommand : public IApiController
	{
	public:
		GetPlayerControlPanelStateCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		static nlohmann::json BuildState(IAIMPCore *core, RemoteControlIdManager &idManager);
		static IAIMPPlaylistItem *CurrentItem(IAIMPCore *core);

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
