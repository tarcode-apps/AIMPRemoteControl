#include "fileAccess.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <unistd.h>
#endif

#include <filesystem>
#include <system_error>

#include "utf8Path.h"

bool CanDeleteFile(const std::string &utf8Path)
{
	const std::filesystem::path path = PathFromUtf8(utf8Path);
#ifdef _WIN32
	// A handle with the DELETE right is granted only when a deletion would be: the
	// rights, a write-protected volume and a sharing conflict all deny it.
	const HANDLE handle = CreateFileW(path.c_str(), DELETE, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, nullptr,
									  OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
	if (handle == INVALID_HANDLE_VALUE)
		return false;
	CloseHandle(handle);
	return true;
#else
	std::error_code error;
	return std::filesystem::is_regular_file(path, error) && access(path.parent_path().c_str(), W_OK) == 0;
#endif
}
