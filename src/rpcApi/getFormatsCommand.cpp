#include "getFormatsCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "aimpHelper.h"
#include "mainThreadRunner.h"

void rpcapi::GetFormatsCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetFormats", [core = FCore](const nlohmann::json &) -> nlohmann::json
	{
		return {{"formats", RunOnMainThread(core, [&] { return SupportedAudioExtensions(core); })}};
	});
}
