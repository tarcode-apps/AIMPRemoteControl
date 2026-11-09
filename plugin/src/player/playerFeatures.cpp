#include "playerFeatures.h"

#include "apiCore.h"
#include "aimpHelper.h"

namespace
{
	int BuildNumber(IAIMPCore *core)
	{
		IAIMPServiceVersionInfo *service = AcquireService<IAIMPServiceVersionInfo>(core, IID_IAIMPServiceVersionInfo);
		if (!service)
			return 0;
		const int build = service->GetBuildNumber();
		service->Release();
		return build;
	}
}

player::PlayerFeatures player::GetPlayerFeatures(IAIMPCore *core)
{
	// v6.00 build 3090 brought both.
	const bool playlistSettings = BuildNumber(core) >= 3090;
	return {playlistSettings, playlistSettings};
}

std::string player::AIMPVersion(IAIMPCore *core)
{
	IAIMPServiceVersionInfo *service = AcquireService<IAIMPServiceVersionInfo>(core, IID_IAIMPServiceVersionInfo);
	if (!service)
		return {};
	IAIMPString *str = nullptr;
	std::string result;
	if (Succeeded(service->FormatInfo(&str)) && str)
		result = ToStringAndRelease(str);
	service->Release();
	return result;
}
