// webapi::InlineContentDisposition and its parts: the name a browser offers for a
// saved cover, which comes from the tags and may hold anything; and the header of
// a downloaded track.
#include "webApi/helpers/contentDisposition.h"

#include "check.h"

using webapi::AttachmentContentDisposition;
using webapi::InlineContentDisposition;
using webapi::PercentEncode;
using webapi::SafeFileName;

int main()
{
	Check("unreserved characters stay", PercentEncode("Az09-._~") == "Az09-._~");
	Check("a space and a slash are encoded", PercentEncode("a b/c") == "a%20b%2Fc");
	Check("UTF-8 is encoded byte by byte", PercentEncode("ё") == "%D1%91");

	Check("a plain name stays", SafeFileName("Artist - Album") == "Artist - Album");
	Check("refused characters become _", SafeFileName("AC/DC: \"Back\" <in> Black?|*\\") == "AC_DC_ _Back_ _in_ Black____");
	Check("control characters become _", SafeFileName("a\tb\nc") == "a_b_c");
	Check("surrounding spaces and dots go", SafeFileName(" ..name.. ") == "name");
	Check("nothing left is empty", SafeFileName(" ... ").empty());

	Check("an ASCII name in both forms", InlineContentDisposition("Artist - Album", "jpg") ==
											 "inline; filename=\"Artist - Album.jpg\"; filename*=UTF-8''Artist%20-%20Album.jpg");
	Check("a Cyrillic name: a stand-in per character and the UTF-8 name",
		  InlineContentDisposition("Ёж", "png") == "inline; filename=\"__.png\"; filename*=UTF-8''%D0%81%D0%B6.png");
	Check("no name, no header", InlineContentDisposition("  ", "png").empty());

	Check("a downloaded file keeps its extension", AttachmentContentDisposition("Трек.mp3") ==
													   "attachment; filename=\"____.mp3\"; filename*=UTF-8''%D0%A2%D1%80%D0%B5%D0%BA.mp3");
	Check("a download without a name is still an attachment", AttachmentContentDisposition("..") == "attachment");
	return Finish();
}
