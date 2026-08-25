#pragma once

#include <string>
#include <vector>

struct NetworkAddress
{
	std::string InterfaceId;
	std::string InterfaceName;
	std::string Address;
	bool IsLoopback = false;
};

std::vector<NetworkAddress> ListIPv4Addresses();
