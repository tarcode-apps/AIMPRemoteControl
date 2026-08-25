#include "networkInterfaces.h"

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <windows.h>
#else
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <net/if.h>
#include <netinet/in.h>
#endif

namespace
{
#ifdef _WIN32
	std::string WideToUtf8(const wchar_t *wide)
	{
		if (!wide || !*wide)
			return {};
		const int size = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
		if (size <= 1)
			return {};
		std::string out(static_cast<std::size_t>(size - 1), '\0');
		WideCharToMultiByte(CP_UTF8, 0, wide, -1, out.data(), size, nullptr, nullptr);
		return out;
	}
#endif

	std::string Ipv4ToString(const in_addr &addr)
	{
		char buffer[INET_ADDRSTRLEN] = {};
		return inet_ntop(AF_INET, const_cast<in_addr *>(&addr), buffer, sizeof(buffer)) ? buffer : std::string();
	}
}

std::vector<NetworkAddress> ListIPv4Addresses()
{
	std::vector<NetworkAddress> result;
#ifdef _WIN32
	ULONG size = 16 * 1024;
	std::vector<unsigned char> buffer;
	const ULONG flags = GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER;
	ULONG status = ERROR_BUFFER_OVERFLOW;
	for (int attempt = 0; attempt < 3 && status == ERROR_BUFFER_OVERFLOW; ++attempt)
	{
		buffer.resize(size);
		status = GetAdaptersAddresses(AF_INET, flags, nullptr, reinterpret_cast<IP_ADAPTER_ADDRESSES *>(buffer.data()), &size);
	}
	if (status != NO_ERROR)
		return result;

	for (auto *adapter = reinterpret_cast<IP_ADAPTER_ADDRESSES *>(buffer.data()); adapter; adapter = adapter->Next)
	{
		if (adapter->OperStatus != IfOperStatusUp)
			continue;
		const bool loopback = adapter->IfType == IF_TYPE_SOFTWARE_LOOPBACK;
		for (auto *unicast = adapter->FirstUnicastAddress; unicast; unicast = unicast->Next)
		{
			const sockaddr *sa = unicast->Address.lpSockaddr;
			if (!sa || sa->sa_family != AF_INET)
				continue;
			result.push_back({adapter->AdapterName ? adapter->AdapterName : "",
							  WideToUtf8(adapter->FriendlyName),
							  Ipv4ToString(reinterpret_cast<const sockaddr_in *>(sa)->sin_addr),
							  loopback});
		}
	}
#else
	ifaddrs *list = nullptr;
	if (getifaddrs(&list) != 0)
		return result;
	for (ifaddrs *ifa = list; ifa; ifa = ifa->ifa_next)
	{
		if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET)
			continue;
		if ((ifa->ifa_flags & IFF_UP) == 0)
			continue;
		result.push_back({ifa->ifa_name ? ifa->ifa_name : "",
						  ifa->ifa_name ? ifa->ifa_name : "",
						  Ipv4ToString(reinterpret_cast<const sockaddr_in *>(ifa->ifa_addr)->sin_addr),
						  (ifa->ifa_flags & IFF_LOOPBACK) != 0});
	}
	freeifaddrs(list);
#endif
	return result;
}
