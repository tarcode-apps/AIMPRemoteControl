#pragma once

#include <filesystem>
#include <string>

// Between std::filesystem::path and the UTF-8 the rest of the plugin speaks.
inline std::filesystem::path PathFromUtf8(const std::string &utf8)
{
	return std::filesystem::path(std::u8string(utf8.begin(), utf8.end()));
}

inline std::string PathToUtf8(const std::filesystem::path &path)
{
	const std::u8string u8 = path.u8string();
	return std::string(u8.begin(), u8.end());
}
