#pragma once

#include <nlohmann/json.hpp>

#include "apiController.h"

struct Settings;
class SharedSettings;

namespace webapi
{
	class SettingsController : public IApiController
	{
	public:
		explicit SettingsController(const SharedSettings &settings) : FSettings(settings) {}

		void Register(IEndpointRouteBuilder &endpoints) override;

		// What the client may know of the plugin's settings.
		static nlohmann::json ToJson(const Settings &settings);

	private:
		const SharedSettings &FSettings;
	};
}
