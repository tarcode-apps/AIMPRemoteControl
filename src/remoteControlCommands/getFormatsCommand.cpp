#include "getFormatsCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"

void GetFormatsCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("GetFormats", [core = FCore](const nlohmann::json &) -> nlohmann::json
	{
		return {{"formats", RunOnMainThread(core, [&] { return SupportedAudioExtensions(core); })}};
	});
}
