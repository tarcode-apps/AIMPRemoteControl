#include "settingsController.h"

#include "settings.h"

nlohmann::json webapi::SettingsController::ToJson(const Settings &settings)
{
	const Settings::FeatureSettings &features = settings.Features;
	return {
		{"permissions", {
			{"downloadTracks", features.DownloadTracks},
			{"uploadTracks", features.UploadTracks},
			{"browseFiles", features.BrowseFiles},
			{"physicalDeletion", features.PhysicalDeletion},
			{"scheduler", features.Scheduler},
		}},
		{"uploadLimit", MaxUploadSize},
		{"uploadFileLimit", MaxUploadParts},
	};
}

void webapi::SettingsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/settings", [&settings = FSettings](const ApiRequest &) -> nlohmann::json
			   { return ToJson(settings.Get()); });
}
