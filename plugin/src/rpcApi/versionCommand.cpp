#include "versionCommand.h"


#include <nlohmann/json.hpp>

#include "pluginInfo.h"
#include "player/playerFeatures.h"

namespace
{
	struct VersionInfo
	{
		std::string AIMPVersion;
		std::string PluginVersion;
	};

	void to_json(nlohmann::json &j, const VersionInfo &v)
	{
		j = {{"aimp_version", v.AIMPVersion}, {"plugin_version", v.PluginVersion}};
	}
}

void rpcapi::VersionCommand::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapRpc("Version", [core = FCore](const nlohmann::json &) -> nlohmann::json
			{ return VersionInfo{player::AIMPVersion(core), PLUGIN_REMOTE_CONTROL_VERSION}; });
}
