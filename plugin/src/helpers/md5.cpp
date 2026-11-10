#include "md5.h"

#include <algorithm/md5.hpp>

std::string Md5Hex(const void *data, std::size_t size)
{
	return digestpp::md5().absorb(static_cast<const unsigned char *>(data), size).hexdigest();
}

std::string Md5Hex(const std::string &s) { return Md5Hex(s.data(), s.size()); }
