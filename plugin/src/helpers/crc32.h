#pragma once

#include <cstddef>
#include <cstdint>

std::uint32_t Crc32Update(std::uint32_t crc, const void *data, std::size_t length);
