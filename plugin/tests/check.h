#pragma once

#include <cstdio>

// What a test program needs: named checks printed as they run, and an exit code
// that tells CTest whether any failed.

inline int checkFailures = 0;

inline void Check(const char *name, bool ok)
{
	std::printf("%s %s\n", ok ? "ok  " : "FAIL", name);
	if (!ok)
		++checkFailures;
}

inline int Finish()
{
	std::printf("%s\n", checkFailures ? "FAILED" : "ALL PASSED");
	return checkFailures ? 1 : 0;
}
