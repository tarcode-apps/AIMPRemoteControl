#include "contentDisposition.h"

#include <cctype>

std::string webapi::PercentEncode(std::string_view text)
{
	static constexpr char Hex[] = "0123456789ABCDEF";
	std::string encoded;
	for (const char c : text)
	{
		const auto byte = static_cast<unsigned char>(c);
		if (std::isalnum(byte) || c == '-' || c == '.' || c == '_' || c == '~')
			encoded += c;
		else
		{
			encoded += '%';
			encoded += Hex[byte >> 4];
			encoded += Hex[byte & 0x0F];
		}
	}
	return encoded;
}

std::string webapi::SafeFileName(std::string_view name)
{
	std::string safe;
	for (const char c : name)
	{
		const auto byte = static_cast<unsigned char>(c);
		const bool refused = byte < 0x20 || byte == 0x7F || c == '\\' || c == '/' || c == ':' || c == '*' ||
							 c == '?' || c == '"' || c == '<' || c == '>' || c == '|';
		safe += refused ? '_' : c;
	}
	const auto trimmed = [](char c) { return c == ' ' || c == '.'; };
	while (!safe.empty() && trimmed(safe.back()))
		safe.pop_back();
	std::size_t start = 0;
	while (start < safe.size() && trimmed(safe[start]))
		++start;
	return safe.substr(start);
}

std::string webapi::InlineContentDisposition(std::string_view name, std::string_view extension)
{
	const std::string safe = SafeFileName(name);
	if (safe.empty())
		return {};
	const std::string file = safe + "." + std::string(extension);
	// One stand-in per character: a UTF-8 sequence is its lead byte and continuation
	// bytes, which are 10xxxxxx.
	std::string ascii;
	for (const char c : file)
	{
		const auto byte = static_cast<unsigned char>(c);
		if (byte < 0x80)
			ascii += c;
		else if ((byte & 0xC0) != 0x80)
			ascii += '_';
	}
	return "inline; filename=\"" + ascii + "\"; filename*=UTF-8''" + PercentEncode(file);
}
