#pragma once

#include <string>
#include <vector>

#include "apiController.h"

class IAIMPCore;
class RemoteControlIdManager;

namespace rpcapi
{
	class GetPlaylistsCommand : public IApiController
	{
	public:
		GetPlaylistsCommand(IAIMPCore *core, RemoteControlIdManager &idManager)
			: FCore(core), FIdManager(idManager) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		static nlohmann::json BuildPlaylists(IAIMPCore *core, RemoteControlIdManager &idManager,
											 const std::vector<std::string> &fields);

	private:
		IAIMPCore *FCore;
		RemoteControlIdManager &FIdManager;
	};
}
