#pragma once

#include "remoteControlCommand.h"

class StateUpdateEvents;

namespace web
{
	class EventsCommand : public IRemoteControlCommand
	{
	public:
		explicit EventsCommand(StateUpdateEvents &events) : FEvents(events) {}

		void Register(IRpcRegistrar &rpc) override;

	private:
		StateUpdateEvents &FEvents;
	};
}
