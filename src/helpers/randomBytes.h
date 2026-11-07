#pragma once

#include <cstddef>
#include <string>

// `count` bytes from the system's cryptographic generator, as lowercase hex.
std::string RandomHex(std::size_t count);
