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

bool player::IsSupportedPlayer(IAIMPCore *core)
{
	// v5.00 was built as 2344.
	return BuildNumber(core) >= 2344;
}

player::PlayerFeatures player::DetectPlayerFeatures(IAIMPCore *core)
{
	const int build = BuildNumber(core);
	return {
		// v6.00 build 3090 brought both settings features.
		.ThumbnailsSetting = build >= 3090,
		.SettingsNotifications = build >= 3090,
		.DeadState = build >= 3095,
		// Seen in v6.00 build 3097; the SDK names it from build 3100.
		.RepeatModeProperty = build >= 3097,
		// v5.10, built as 2418.
		.GroupShuffle = build >= 2418,
		// v5.11, built as 2436.
		.SideAlignmentInOrder = build >= 2436,
	};
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
