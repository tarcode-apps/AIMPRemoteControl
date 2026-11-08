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
