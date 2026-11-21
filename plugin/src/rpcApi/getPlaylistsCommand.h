#pragma once

#include <string>
#include <vector>

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace player
{
	struct PlayerFeatures;
}

namespace rpcapi
{
	class GetPlaylistsCommand : public IApiController
	{
	public:
		GetPlaylistsCommand(IAIMPCore *core, const player::PlayerFeatures &features, RemoteControlIdManager &idManager)
			: FCore(core), FFeatures(features), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		static nlohmann::json BuildPlaylists(IAIMPCore *core, const player::PlayerFeatures &features, RemoteControlIdManager &idManager,
											 const std::vector<std::string> &fields);

	private:
		IAIMPCore *FCore;
		const player::PlayerFeatures &FFeatures;
		RemoteControlIdManager &FIdManager;
	};
}
