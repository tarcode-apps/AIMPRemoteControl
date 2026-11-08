// NaturalCompare: the orders a file manager shows, and the strict weak
// ordering std::sort relies on, over random and hostile names. Windows compares
// with the system's StrCmpLogicalW; elsewhere the plugin's own code does.
#include "naturalCompare.h"

#include <algorithm>
#include <random>
#include <string>
#include <vector>

#include "check.h"

namespace
{
	bool Less(const std::string &a, const std::string &b)
	{
		return NaturalCompare(a, b) < 0;
	}

	bool Equivalent(const std::string &a, const std::string &b)
	{
		return !Less(a, b) && !Less(b, a);
	}

	// Names put together from pieces that trip comparators up: digit runs with
	// and without leading zeros, case, punctuation, Cyrillic and Arabic digits.
	// File names elsewhere are any bytes, so invalid UTF-8 joins them there; on
	// Windows a name always comes from UTF-16 and is valid.
	std::vector<std::string> RandomNames(std::mt19937 &rng, int count)
	{
		std::vector<std::string> pieces = {"a", "A", "b", "z", "0", "1", "9", "00", "10", " ", "(", ")", "-", ".", "я",
										   "Я", "ё", "٣"};
#ifndef _WIN32
		pieces.insert(pieces.end(), {"\xff", "\xc3", "\xe2\x80"});
#endif
		std::vector<std::string> names;
		for (int i = 0; i < count; ++i)
		{
			std::string name;
			const int length = static_cast<int>(rng() % 8);
			for (int j = 0; j < length; ++j)
				name += pieces[rng() % pieces.size()];
			names.push_back(name);
		}
		return names;
	}
}

int main()
{
	Check("Track 9 before Track 10", Less("Track 9", "Track 10") && !Less("Track 10", "Track 9"));
	Check("file (2) before file (10)", Less("file (2).mp3", "file (10).mp3"));
	Check("1 before 2 before 10", Less("1", "2") && Less("2", "10"));
	Check("digits before letters", Less("1a", "a1"));
	Check("a prefix first", Less("ab", "ab1") && Less("ab", "abc"));
	Check("the empty name first", Less("", "a") && !Less("", ""));
#ifdef _WIN32
	// The system's collation, as Explorer sorts; elsewhere it is the user's
	// locale, which a build machine may not have.
	Check("case aside", Less("a", "B") && Less("B", "c"));
	Check("Cyrillic case aside", Less("апельсин", "Яблоко"));
#else
	// Explorer's comparison does not order runs this long by value; this one
	// compares runs of any length.
	Check("long digit runs by their length", Less(std::string(300, '9'), "1" + std::string(300, '0')));
	Check("leading zeros aside", Equivalent("01", "1"));
	Check("invalid UTF-8 compared, not thrown on", (Less("\xff\xfe", "a"), true));
#endif

	std::mt19937 rng(42);
	std::vector<std::string> names = RandomNames(rng, 3000);
	bool irreflexive = true, asymmetric = true, transitive = true, equivalenceTransitive = true;
	for (const std::string &a : names)
		irreflexive &= !Less(a, a);
	for (int i = 0; i < 300000; ++i)
	{
		const std::string &a = names[rng() % names.size()];
		const std::string &b = names[rng() % names.size()];
		const std::string &c = names[rng() % names.size()];
		asymmetric &= !(Less(a, b) && Less(b, a));
		transitive &= !(Less(a, b) && Less(b, c) && !Less(a, c));
		equivalenceTransitive &= !(Equivalent(a, b) && Equivalent(b, c) && !Equivalent(a, c));
	}
	Check("irreflexive", irreflexive);
	Check("asymmetric", asymmetric);
	Check("transitive", transitive);
	Check("equivalence transitive", equivalenceTransitive);

	std::sort(names.begin(), names.end(), Less);
	Check("std::sort leaves the names in order", std::is_sorted(names.begin(), names.end(), Less));

	return Finish();
}
