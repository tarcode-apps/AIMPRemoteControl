#pragma once

#include <charconv>
#include <cstdint>
#include <optional>
#include <string_view>

// The whole text as a number, or nothing: a `\d+` capture of a route may be
// longer than the type, and a request is no place for an exception.
inline std::optional<std::int32_t> ParseInt32(std::string_view text)
{
	std::int32_t value = 0;
	const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value);
	if (error != std::errc() || end != text.data() + text.size())
		return std::nullopt;
	return value;
}
