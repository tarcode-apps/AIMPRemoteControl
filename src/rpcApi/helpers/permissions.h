#pragma once

#include "settings.h"

namespace rpcapi
{
	// The app offers the computer's files only under its upload permission, so
	// browsing them and adding them by path take both settings, as they did
	// before the two became independent.
	inline bool CanBrowseFiles(const Settings::FeatureSettings &features)
	{
		return features.UploadTracks && features.BrowseFiles;
	}
}
