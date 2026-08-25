#include "showMessageCommand.h"

#include <functional>
#include <string>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiMessages.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"

void ShowMessageCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("ShowMessage", [core = FCore](const nlohmann::json &params) -> nlohmann::json
	{
		const std::string message = params.value("message", std::string());
		const bool shown = RunOnMainThread(core, [&]
										   {
			IAIMPServiceMessageDispatcher *dispatcher = nullptr;
			if (Failed(core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))) || !dispatcher)
				return false;

			bool ok = false;
			if (IAIMPString *text = StringToIAIMPString(core, message))
			{
				ok = Succeeded(dispatcher->Send(AIMP_MSG_CMD_SHOW_NOTIFICATION, 0, text->GetData()));
				text->Release();
			}
			dispatcher->Release();
			return ok; });
		return {{"success", shown}};
	});
}
