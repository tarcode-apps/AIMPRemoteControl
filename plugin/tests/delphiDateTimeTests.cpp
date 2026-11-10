// DelphiDateTimeToCivil: the dates the player stamps its statistics with, as
// Delphi counts them, on the epoch, around leap days and at the edges of a day.
#include "delphiDateTime.h"

#include "check.h"

namespace
{
	bool Is(const CivilTime &civil, int year, int month, int day, int hour, int minute, int second)
	{
		return civil.Year == year && civil.Month == month && civil.Day == day && civil.Hour == hour &&
			   civil.Minute == minute && civil.Second == second;
	}
}

int main()
{
	Check("zero is Delphi's epoch", Is(DelphiDateTimeToCivil(0), 1899, 12, 30, 0, 0, 0));
	Check("the fraction is the time of day", Is(DelphiDateTimeToCivil(2.5), 1900, 1, 1, 12, 0, 0));
	Check("the Unix epoch", Is(DelphiDateTimeToCivil(25569), 1970, 1, 1, 0, 0, 0));
	Check("the year 2000", Is(DelphiDateTimeToCivil(36526), 2000, 1, 1, 0, 0, 0));
	Check("a leap day", Is(DelphiDateTimeToCivil(45351), 2024, 2, 29, 0, 0, 0));
	Check("the day after it", Is(DelphiDateTimeToCivil(45352), 2024, 3, 1, 0, 0, 0));
	Check("an evening in 2025", Is(DelphiDateTimeToCivil(45658.75), 2025, 1, 1, 18, 0, 0));
	Check("seconds are rounded", Is(DelphiDateTimeToCivil(45658 + 3661.4 / 86400), 2025, 1, 1, 1, 1, 1));
	Check("just before midnight", Is(DelphiDateTimeToCivil(45658.99999), 2025, 1, 1, 23, 59, 59));
	Check("rounding rolls into the next day", Is(DelphiDateTimeToCivil(45658.999999), 2025, 1, 2, 0, 0, 0));
	Check("zero is never", DelphiDateTimeToIso8601(0).empty());
	Check("ISO 8601 ends in Z", DelphiDateTimeToIso8601(45658.75).ends_with("Z"));
	return Finish();
}
