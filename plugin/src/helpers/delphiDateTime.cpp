#include "delphiDateTime.h"

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <ctime>

namespace
{
	constexpr std::int64_t SecondsPerDay = 86400;
	// 1970-01-01 as a TDateTime.
	constexpr std::int64_t UnixEpochDays = 25569;

	// Howard Hinnant's civil_from_days: days since 1970-01-01 to a date.
	void DateFromDays(std::int64_t days, CivilTime &civil)
	{
		days += 719468;
		const std::int64_t era = (days >= 0 ? days : days - 146096) / 146097;
		const std::int64_t dayOfEra = days - era * 146097;
		const std::int64_t yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146096) / 365;
		const std::int64_t dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100);
		const std::int64_t shiftedMonth = (5 * dayOfYear + 2) / 153;
		const std::int64_t month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
		civil.Year = static_cast<int>(yearOfEra + era * 400 + (month <= 2 ? 1 : 0));
		civil.Month = static_cast<int>(month);
		civil.Day = static_cast<int>(dayOfYear - (153 * shiftedMonth + 2) / 5 + 1);
	}
}

CivilTime DelphiDateTimeToCivil(double value)
{
	const auto seconds = static_cast<std::int64_t>(std::floor(value * SecondsPerDay + 0.5));
	CivilTime civil;
	DateFromDays(seconds / SecondsPerDay - UnixEpochDays, civil);
	const std::int64_t ofDay = seconds % SecondsPerDay;
	civil.Hour = static_cast<int>(ofDay / 3600);
	civil.Minute = static_cast<int>(ofDay % 3600 / 60);
	civil.Second = static_cast<int>(ofDay % 60);
	return civil;
}

std::string DelphiDateTimeToIso8601(double value)
{
	if (value == 0)
		return {};
	const CivilTime civil = DelphiDateTimeToCivil(value);
	std::tm local = {};
	local.tm_year = civil.Year - 1900;
	local.tm_mon = civil.Month - 1;
	local.tm_mday = civil.Day;
	local.tm_hour = civil.Hour;
	local.tm_min = civil.Minute;
	local.tm_sec = civil.Second;
	local.tm_isdst = -1;
	const std::time_t moment = std::mktime(&local);
	std::tm utc = {};
#ifdef _WIN32
	gmtime_s(&utc, &moment);
#else
	gmtime_r(&moment, &utc);
#endif
	char text[32];
	std::snprintf(text, sizeof(text), "%04d-%02d-%02dT%02d:%02d:%02dZ", utc.tm_year + 1900, utc.tm_mon + 1, utc.tm_mday,
				  utc.tm_hour, utc.tm_min, utc.tm_sec);
	return text;
}
