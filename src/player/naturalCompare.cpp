#include "naturalCompare.h"

#ifdef _WIN32
#include <windows.h>
#include <shlwapi.h>
#else
#include <locale>
#include <stdexcept>
#include <string_view>
#endif

#include "utf8Path.h"

#ifndef _WIN32
namespace
{
	// The user's locale; the classic one when the environment names one the
	// library does not know.
	const std::locale &CollationLocale()
	{
		static const std::locale locale = []
		{
			try
			{
				return std::locale("");
			}
			catch (const std::runtime_error &)
			{
				return std::locale::classic();
			}
		}();
		return locale;
	}

	bool IsDigit(char c)
	{
		return c >= '0' && c <= '9';
	}

	// Takes the next run of digits, or of anything else, off the front of `rest`.
	std::string_view NextToken(std::string_view &rest)
	{
		const bool digits = IsDigit(rest.front());
		std::size_t length = 1;
		while (length < rest.size() && IsDigit(rest[length]) == digits)
			++length;
		const std::string_view token = rest.substr(0, length);
		rest.remove_prefix(length);
		return token;
	}

	// By value without converting, so that no run is too long: by length once
	// the leading zeros are gone, then digit by digit.
	int CompareNumbers(std::string_view a, std::string_view b)
	{
		a.remove_prefix(std::min(a.find_first_not_of('0'), a.size()));
		b.remove_prefix(std::min(b.find_first_not_of('0'), b.size()));
		if (a.size() != b.size())
			return a.size() < b.size() ? -1 : 1;
		return a.compare(b);
	}
}
#endif

int player::NaturalCompare(const std::string &a, const std::string &b)
{
#ifdef _WIN32
	return StrCmpLogicalW(PathFromUtf8(a).wstring().c_str(), PathFromUtf8(b).wstring().c_str());
#else
	const auto &collate = std::use_facet<std::collate<char>>(CollationLocale());
	std::string_view restA = a, restB = b;
	while (!restA.empty() && !restB.empty())
	{
		const std::string_view tokenA = NextToken(restA), tokenB = NextToken(restB);
		const bool numberA = IsDigit(tokenA.front()), numberB = IsDigit(tokenB.front());
		// Digits come before letters, as they do in the character tables.
		if (numberA != numberB)
			return numberA ? -1 : 1;
		const int order = numberA
							  ? CompareNumbers(tokenA, tokenB)
							  : collate.compare(tokenA.data(), tokenA.data() + tokenA.size(), tokenB.data(), tokenB.data() + tokenB.size());
		if (order != 0)
			return order;
	}
	if (restA.empty() && restB.empty())
		return 0;
	return restA.empty() ? -1 : 1;
#endif
}
