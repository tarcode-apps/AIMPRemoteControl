#pragma once

#include <initializer_list>

#include <nlohmann/json.hpp>

inline nlohmann::json PickFields(const nlohmann::json &source, std::initializer_list<const char *> fields)
{
	nlohmann::json out = nlohmann::json::object();
	for (const char *field : fields)
		if (source.contains(field))
			out[field] = source[field];
	return out;
}
