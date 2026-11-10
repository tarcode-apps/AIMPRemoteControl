#pragma once

#include <cstddef>
#include <string>

std::string Md5Hex(const void *data, std::size_t size);
std::string Md5Hex(const std::string &s);
