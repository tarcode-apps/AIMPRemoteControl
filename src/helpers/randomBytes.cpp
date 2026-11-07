#include "randomBytes.h"

#include <stdexcept>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#include <bcrypt.h>
#else
#include <sys/random.h>
#endif

std::string RandomHex(std::size_t count)
{
	std::vector<unsigned char> bytes(count);
#ifdef _WIN32
	if (!BCRYPT_SUCCESS(BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(count), BCRYPT_USE_SYSTEM_PREFERRED_RNG)))
		throw std::runtime_error("BCryptGenRandom failed");
#else
	for (std::size_t done = 0; done < count;)
	{
		const ssize_t read = getrandom(bytes.data() + done, count - done, 0);
		if (read < 0)
			throw std::runtime_error("getrandom failed");
		done += static_cast<std::size_t>(read);
	}
#endif
	static constexpr char Digits[] = "0123456789abcdef";
	std::string hex;
	hex.reserve(count * 2);
	for (const unsigned char byte : bytes)
	{
		hex += Digits[byte >> 4];
		hex += Digits[byte & 0x0f];
	}
	return hex;
}
