#include "moduleDirectory.h"

#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

std::filesystem::path ModuleDirectory()
{
#ifdef _WIN32
	HMODULE module = nullptr;
	if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT,
							reinterpret_cast<LPCWSTR>(&ModuleDirectory), &module))
		return {};
	wchar_t buffer[MAX_PATH] = {};
	const DWORD length = GetModuleFileNameW(module, buffer, MAX_PATH);
	if (length == 0 || length >= MAX_PATH)
		return {};
	return std::filesystem::path(std::wstring(buffer, length)).parent_path();
#else
	Dl_info info{};
	if (dladdr(reinterpret_cast<void *>(&ModuleDirectory), &info) == 0 || !info.dli_fname)
		return {};
	return std::filesystem::path(info.dli_fname).parent_path();
#endif
}
