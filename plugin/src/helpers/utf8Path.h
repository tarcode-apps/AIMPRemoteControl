#pragma once

#include <filesystem>
#include <optional>
#include <string>
#include <system_error>

// Between std::filesystem::path and the UTF-8 the rest of the plugin speaks.
inline std::filesystem::path PathFromUtf8(const std::string &utf8)
{
	return std::filesystem::path(std::u8string(utf8.begin(), utf8.end()));
}

// For text a client sent: MSVC refuses bytes that are no UTF-8, and a path
// that cannot be named cannot be found.
inline std::optional<std::filesystem::path> TryPathFromUtf8(const std::string &text)
{
	try
	{
		return PathFromUtf8(text);
	}
	catch (const std::system_error &)
	{
		return std::nullopt;
	}
}

inline std::string PathToUtf8(const std::filesystem::path &path)
{
	const std::u8string u8 = path.u8string();
	return std::string(u8.begin(), u8.end());
}
