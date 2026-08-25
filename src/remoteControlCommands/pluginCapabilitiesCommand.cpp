#include "pluginCapabilitiesCommand.h"

#include <functional>

#include <nlohmann/json.hpp>

#include "settings.h"

void PluginCapabilitiesCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("PluginCapabilities", [&settings = FSettings](const nlohmann::json &) -> nlohmann::json
	{
		const Settings::FeatureSettings f = settings.Get().Features;
		return {
			{"physical_track_deletion", f.PhysicalDeletion},
			{"upload_track", f.UploadTracks},
			{"scheduler", {{"supported", true}, {"allowed", f.Scheduler}}},
		};
	});
}
