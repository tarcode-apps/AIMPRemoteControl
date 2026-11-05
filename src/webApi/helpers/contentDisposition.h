#pragma once

#include <string>
#include <string_view>

// cpp-httplib only parses this header, for the uploads; its own encoders leave
// ' ( ) * unencoded, which RFC 5987 does not allow in the extended parameter.
namespace webapi
{
	// Every byte but the unreserved characters of RFC 3986 as %XX, for a query
	// value or the extended parameter of RFC 5987.
	std::string PercentEncode(std::string_view text);

	// A name that any file system takes: the characters Windows refuses in a file
	// name and the control characters as "_", without surrounding spaces and dots.
	std::string SafeFileName(std::string_view name);

	// `inline` with the file name a browser offers when the response is saved:
	// an ASCII stand-in for old clients and the UTF-8 name of RFC 6266. Empty for
	// a name with nothing left after `SafeFileName`.
	std::string InlineContentDisposition(std::string_view name, std::string_view extension);
}
