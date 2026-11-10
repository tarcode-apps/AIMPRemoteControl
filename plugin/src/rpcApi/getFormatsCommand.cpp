#include "getFormatsCommand.h"

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "mainThreadRunner.h"
#include "player/files.h"

void rpcapi::GetFormatsCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("GetFormats", [core = FCore](const nlohmann::json &) -> nlohmann::json
	{
		return {{"formats", RunOnMainThread(core, [&] { return player::GetFileFormats(core).Audio; })}};
	});
}
