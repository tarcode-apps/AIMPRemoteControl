#pragma once

#include <string>

// Orders names as the system's file manager does: runs of digits by their
// value, so that "Track 9" comes before "Track 10", the rest by the system's
// own collation. Negative, zero or positive like strcmp; names with the same
// digits apart from leading zeros compare equal. Any thread.
int NaturalCompare(const std::string &a, const std::string &b);
