#include "crc32.h"

#include <array>

namespace
{
	const std::array<std::uint32_t, 256> kTable = []
	{
		std::array<std::uint32_t, 256> t{};
		for (std::uint32_t i = 0; i < 256; ++i)
		{
			std::uint32_t c = i;
			for (int k = 0; k < 8; ++k)
				c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
			t[i] = c;
		}
		return t;
	}();
}

std::uint32_t Crc32Update(std::uint32_t crc, const void *data, std::size_t length)
{
	const auto *bytes = static_cast<const std::uint8_t *>(data);
	crc ^= 0xFFFFFFFFu;
	for (std::size_t i = 0; i < length; ++i)
		crc = kTable[(crc ^ bytes[i]) & 0xFFu] ^ (crc >> 8);
	return crc ^ 0xFFFFFFFFu;
}
