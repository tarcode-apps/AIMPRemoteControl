#pragma once

#include "remoteControlCommand.h"

class IAIMPCore;

namespace web
{
	class PlaylistsCommand : public IRemoteControlCommand
	{
	public:
		explicit PlaylistsCommand(IAIMPCore *core) : FCore(core) {}

		void Register(IRpcRegistrar &rpc) override;

	private:
		IAIMPCore *FCore;
	};
}
