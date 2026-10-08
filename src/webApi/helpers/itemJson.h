#pragma once

#include <cstdint>
#include <string>

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
			{"fileUri", item.FileUri},
		};
	}

	inline nlohmann::json ItemJson(const player::PlaylistItem &item, const std::string &playlistId, std::uint64_t revision)
	{
		nlohmann::json json = ItemJson(item);
		json["playlistId"] = playlistId;
		json["revision"] = revision;
		return json;
	}

	inline nlohmann::json DetailsJson(const player::ItemDetails &details)
	{
		nlohmann::json json = ItemJson(details.Item);
		json["artist"] = details.Artist;
		json["album"] = details.Album;
		json["genre"] = details.Genre;
		json["year"] = details.Year;
		json["folder"] = details.Folder;
		return json;
	}
}
