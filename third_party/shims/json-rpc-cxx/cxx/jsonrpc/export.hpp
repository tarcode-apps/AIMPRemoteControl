#pragma once
//
// Shadows third_party/json-rpc-cxx/include/cxx/jsonrpc/export.hpp.
//
// The upstream header has no way to say "I am used header-only": it expands
// CXX_JSONRPC_API to __declspec(dllexport) when CXX_JSONRPC_EXPORT_DLL is set
// and to __declspec(dllimport) otherwise. dllimport is rejected by MSVC on the
// library's inline definitions, and dllexport pushes ~40 jsonrpc symbols into
// this plugin's export table (on Linux it defeats -fvisibility=hidden the same
// way). The macro is defined unconditionally there, so -D cannot override it.
//
// Instead the shim directory is placed ahead of the library's own include
// directory, so this file is what `#include "cxx/jsonrpc/export.hpp"` resolves
// to and the upstream one is never read. Nothing else in json-rpc-cxx is
// shadowed. If a future version puts more than these two macros into
// export.hpp, this file has to be updated with it.
//
#define CXX_JSONRPC_API
#define CXX_JSONRPC_INTERNAL
