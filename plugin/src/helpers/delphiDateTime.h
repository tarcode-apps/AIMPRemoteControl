#pragma once

#include <string>

// Delphi's TDateTime, which the AIMP SDK uses for dates: days since 1899-12-30,
// the fraction being the time of day, in the player's local time. Only dates
// from 1899-12-30 on are handled; Delphi's rule for earlier ones does not arise.
struct CivilTime
{
	int Year = 0;
	int Month = 0; // 1..12
	int Day = 0;   // 1..31
	int Hour = 0;
	int Minute = 0;
	int Second = 0;
};

// Rounded to the nearest second.
CivilTime DelphiDateTimeToCivil(double value);

// The moment in UTC, as "2026-11-04T01:12:33Z"; empty for zero, which the player
// uses for "never".
std::string DelphiDateTimeToIso8601(double value);
