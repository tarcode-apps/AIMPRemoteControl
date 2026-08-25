# CMakeList.txt : CMake project for AIMPRemoteControlPlugin, include source and define
# project specific logic here.
#
cmake_minimum_required (VERSION 3.28)

# Enable Hot Reload for MSVC compilers if supported.
if (POLICY CMP0141)
  cmake_policy(SET CMP0141 NEW)
  set(CMAKE_MSVC_DEBUG_INFORMATION_FORMAT "$<IF:$<AND:$<C_COMPILER_ID:MSVC>,$<CXX_COMPILER_ID:MSVC>>,$<$<CONFIG:Debug,RelWithDebInfo>:EditAndContinue>,$<$<CONFIG:Debug,RelWithDebInfo>:ProgramDatabase>>")
endif()

project ("AIMPRemoteControlPlugin")

# On Linux, stub out cairo.h so the SDK compiles without libcairo-dev.
# HCANVAS becomes void* — sufficient for plugins that don't use canvas drawing.
if (NOT WIN32)
  file(WRITE "${CMAKE_BINARY_DIR}/cairo_stub/cairo.h" "typedef struct _cairo cairo_t;\n")
  set(CAIRO_STUB_DIR "${CMAKE_BINARY_DIR}/cairo_stub")
endif()

# Auto-collect everything under src/ — adding/removing files no longer requires
# editing this file. CONFIGURE_DEPENDS makes Ninja/MSBuild re-run CMake when the
# set of matching files changes.
file(GLOB_RECURSE PLUGIN_SOURCES CONFIGURE_DEPENDS
  "${CMAKE_SOURCE_DIR}/src/*.cpp"
  "${CMAKE_SOURCE_DIR}/src/*.h")

add_library(AIMPRemoteControlPlugin SHARED
  ${PLUGIN_SOURCES}
  "third_party/aimp-sdk/apiTypes.cpp")

# Year for the copyright notice (pluginInfo.h), taken when the build is configured.
string(TIMESTAMP PLUGIN_BUILD_YEAR "%Y")
target_compile_definitions(AIMPRemoteControlPlugin PRIVATE PLUGIN_BUILD_YEAR=${PLUGIN_BUILD_YEAR})

# Both platforms declare their export table in one file, so the plugin exposes
# AIMPPluginGetHeader and nothing else. CMake turns a .def in the source list
# into /DEF: for the MSVC linker; ELF needs the version script passed by hand.
if (MSVC)
  enable_language(RC)
  # The .def exports AIMPPluginGetHeader only; the .rc adds the VERSIONINFO
  # block (version, product, copyright) shown in the DLL file properties.
  target_sources(AIMPRemoteControlPlugin PRIVATE
    "${CMAKE_SOURCE_DIR}/src/plugin.def"
    "${CMAKE_SOURCE_DIR}/src/version.rc")
  # OriginalFilename/InternalName in the resource come from the target itself,
  # so they cannot drift from what is actually built.
  target_compile_definitions(AIMPRemoteControlPlugin PRIVATE
    "PLUGIN_FILE_NAME=\"$<TARGET_FILE_NAME:AIMPRemoteControlPlugin>\""
    "PLUGIN_INTERNAL_NAME=\"$<TARGET_FILE_BASE_NAME:AIMPRemoteControlPlugin>\"")
elseif (CMAKE_SYSTEM_NAME STREQUAL "Linux")
  target_link_options(AIMPRemoteControlPlugin PRIVATE
    "-Wl,--version-script=${CMAKE_SOURCE_DIR}/src/plugin.map")
  set_property(TARGET AIMPRemoteControlPlugin APPEND
    PROPERTY LINK_DEPENDS "${CMAKE_SOURCE_DIR}/src/plugin.map")
endif()

# Standalone Asio (header-only) for cross-platform networking.
add_library(asio INTERFACE)
target_include_directories(asio INTERFACE "${CMAKE_SOURCE_DIR}/third_party/asio/include")
target_compile_definitions(asio INTERFACE ASIO_STANDALONE ASIO_NO_DEPRECATED)
if (WIN32)
  target_compile_definitions(asio INTERFACE _WIN32_WINNT=0x0A00)
  target_link_libraries(asio INTERFACE ws2_32 mswsock)
endif()

# Header-only third-party libraries via git submodules.
add_library(nlohmann_json INTERFACE)
target_include_directories(nlohmann_json INTERFACE "${CMAKE_SOURCE_DIR}/third_party/json/include")

add_library(cpp_httplib INTERFACE)
target_include_directories(cpp_httplib INTERFACE "${CMAKE_SOURCE_DIR}/third_party/cpp-httplib")

# Header-only hashes; the plugin only pulls <algorithm/md5.hpp> for HTTP Digest.
add_library(digestpp INTERFACE)
target_include_directories(digestpp INTERFACE "${CMAKE_SOURCE_DIR}/third_party/digestpp")

add_library(json_rpc_cxx INTERFACE)
# Order matters: the shim directory holds a replacement for the library's
# export.hpp and has to be found first. See the header itself for why.
target_include_directories(json_rpc_cxx INTERFACE
  "${CMAKE_SOURCE_DIR}/third_party/shims/json-rpc-cxx"
  "${CMAKE_SOURCE_DIR}/third_party/json-rpc-cxx/include")
target_link_libraries(json_rpc_cxx INTERFACE nlohmann_json)

# Binary distributions must carry the bundled libraries' license texts.
# Collected automatically: every third_party/ subdirectory that ships a
# LICENSE-like file contributes it to THIRD-PARTY-NOTICES.txt in the build
# folder; the build scripts copy the file into dist/ next to the plugin.
# The AIMP SDK publishes no license text — see the License section of README.md.
set(NOTICES "Third-party software bundled with the AIMP Remote Control plugin.\n")
set(NOTICES_RULE "--------------------------------------------------------------------------")
file(GLOB THIRD_PARTY_DIRS RELATIVE "${CMAKE_SOURCE_DIR}/third_party" "${CMAKE_SOURCE_DIR}/third_party/*")
list(SORT THIRD_PARTY_DIRS)
foreach(dep IN LISTS THIRD_PARTY_DIRS)
  file(GLOB LICENSE_CANDIDATES
    "${CMAKE_SOURCE_DIR}/third_party/${dep}/LICENSE*"
    "${CMAKE_SOURCE_DIR}/third_party/${dep}/COPYING*")
  foreach(candidate IN LISTS LICENSE_CANDIDATES)
    if (NOT IS_DIRECTORY "${candidate}")
      file(READ "${candidate}" LICENSE_TEXT)
      string(APPEND NOTICES "\n${NOTICES_RULE}\n${dep}\n${NOTICES_RULE}\n\n${LICENSE_TEXT}")
      set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${candidate}")
      break()
    endif()
  endforeach()
endforeach()
string(APPEND NOTICES "\n${NOTICES_RULE}\naimp-sdk\n${NOTICES_RULE}\n\n\
AIMP SDK header files, (c) Artem Izmaylov, https://www.aimp.ru/.\n\
Distributed as part of the official AIMP SDK; not covered by this project's\n\
MIT license. See the License section of the project's README.md.\n")
file(WRITE "${CMAKE_BINARY_DIR}/THIRD-PARTY-NOTICES.txt" "${NOTICES}")

find_package(Threads REQUIRED)
target_link_libraries(AIMPRemoteControlPlugin PRIVATE
  Threads::Threads asio nlohmann_json cpp_httplib json_rpc_cxx digestpp
  # SHGetKnownFolderPath / CoTaskMemFree for the default upload folder.
  $<$<BOOL:${WIN32}>:shell32>
  $<$<BOOL:${WIN32}>:ole32>
  # IsPwrSuspendAllowed / IsPwrHibernateAllowed for the sleep timer capabilities.
  # PathGetCharType for upload file names.
  $<$<BOOL:${WIN32}>:shlwapi>
  $<$<BOOL:${WIN32}>:powrprof>
  # GetAdaptersAddresses for the address list in the options dialog.
  $<$<BOOL:${WIN32}>:iphlpapi>
  $<$<BOOL:${WIN32}>:ws2_32>)

target_include_directories(AIMPRemoteControlPlugin PRIVATE
  "${CMAKE_SOURCE_DIR}/src"
  "${CMAKE_SOURCE_DIR}/src/helpers"
  "${CMAKE_SOURCE_DIR}/third_party/aimp-sdk"
  $<$<NOT:$<BOOL:${WIN32}>>:${CAIRO_STUB_DIR}>
)
set_target_properties(AIMPRemoteControlPlugin PROPERTIES
  # AIMP loads Plugins/<Name>/<Name>.dll; "Plugin" in the file name would be redundant there.
  OUTPUT_NAME "aimp_remote_control"
  PREFIX ""
  POSITION_INDEPENDENT_CODE ON
  # Only AIMPPluginGetHeader has to leave the shared object; hiding the rest
  # keeps the plugin from colliding with symbols of the host process.
  C_VISIBILITY_PRESET hidden
  CXX_VISIBILITY_PRESET hidden
  VISIBILITY_INLINES_HIDDEN ON
)

# A plugin ships to machines we don't control, so a Release build must not
# depend on the Visual C++ Redistributable being installed there.
option(AIMP_MSVC_STATIC_RUNTIME "Link the MSVC runtime statically" ON)
if (MSVC AND AIMP_MSVC_STATIC_RUNTIME)
  set_property(TARGET AIMPRemoteControlPlugin PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

# AIMP SDK uses wchar_t strings on Windows (typedef wchar_t TChar).
# UNICODE must be defined so that TEXT() expands to L"..." instead of "...".
if (WIN32)
  target_compile_definitions(AIMPRemoteControlPlugin PRIVATE UNICODE _UNICODE NOMINMAX)
endif()

# AIMP SDK assigns string literals to non-const PChar (wchar_t*).
# Relax strict string checking so the SDK headers compile under C++20.
# /EHsc is explicit: CMake 4.x no longer adds it to the MSVC defaults, and
# httplib/json-rpc-cxx/nlohmann all need working stack unwinding.
if (MSVC)
  target_compile_options(AIMPRemoteControlPlugin PRIVATE /Zc:strictStrings- /EHsc)
endif()

set_property(TARGET AIMPRemoteControlPlugin PROPERTY CXX_STANDARD 20)
set_property(TARGET AIMPRemoteControlPlugin PROPERTY CXX_STANDARD_REQUIRED ON)

# The four heavy third-party headers dominate compile time of every TU that
# touches networking or JSON. Precompiling them roughly halves an incremental
# rebuild of such a TU (measured: 7.1s -> 3.1s) at no cost to clean builds.
target_precompile_headers(AIMPRemoteControlPlugin PRIVATE
  <asio.hpp> <httplib.h> <nlohmann/json.hpp> <cxx/jsonrpc/server.hpp>)

# No C++20 modules here; without this CMake 4.x runs a scan pass of the
# compiler over every source anyway (~8% of a clean build).
set_property(TARGET AIMPRemoteControlPlugin PROPERTY CXX_SCAN_FOR_MODULES OFF)
