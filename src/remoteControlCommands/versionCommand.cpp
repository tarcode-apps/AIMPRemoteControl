#include "versionCommand.h"

#include <functional>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "aimpHelper.h"
#include "pluginInfo.h"

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

	std::string GetAIMPVersion(IAIMPCore *core)
	{
		if (!core)
			return {};
		IAIMPServiceVersionInfo *service = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServiceVersionInfo, reinterpret_cast<void **>(&service))) || !service)
			return {};

		IAIMPString *str = nullptr;
		std::string result;
		if (Succeeded(service->FormatInfo(&str)) && str)
		{
			result = IAIMPStringToString(str);
			str->Release();
		}
		service->Release();
		return result;
	}
}

void VersionCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Version", [core = FCore](const nlohmann::json &) -> nlohmann::json
			{ return VersionInfo{GetAIMPVersion(core), PLUGIN_REMOTE_CONTROL_VERSION}; });
}
