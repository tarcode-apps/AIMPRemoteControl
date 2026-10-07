#pragma once

#include <nlohmann/json.hpp>

#include "player/covers.h"
#include "player/playlistItems.h"

namespace webapi
{
	inline nlohmann::json ItemJson(const player::PlaylistItem &item)
	{
		return {
			{"index", item.Index},
			{"displayText", item.DisplayText},
			{"secondLine", item.SecondLine},
			{"duration", item.Duration},
			{"size", item.Size},
			{"rating", item.Rating},
			{"enabled", item.Enabled},
			{"isUrl", item.IsUrl},
			{"cover", player::CoverKey(item.Cover)},
		};
	}
}
