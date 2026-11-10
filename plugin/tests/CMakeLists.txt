# Unit tests of the plugin's code that needs no player; what talks to AIMP is
# tested against a running player by web-client/e2e. Every *Tests.cpp here is a
# test program of its own: it prints its checks and exits non-zero when one
# fails. The programs link the plugin's code as a static library, from which
# the linker takes only what a test calls, so a new test needs no line here.

add_library(AIMPRemoteControlTestCode STATIC)
target_link_libraries(AIMPRemoteControlTestCode PUBLIC AIMPRemoteControlCode)

# What the test-* scripts build: the test programs, without the plugin.
add_custom_target(unit_tests)

file(GLOB TEST_SOURCES CONFIGURE_DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/*Tests.cpp")
foreach(source IN LISTS TEST_SOURCES)
  get_filename_component(name "${source}" NAME_WE)
  add_executable(${name} "${source}")
  target_link_libraries(${name} PRIVATE AIMPRemoteControlTestCode)
  set_target_properties(${name} PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_SCAN_FOR_MODULES OFF)
  if (MSVC)
    # For the non-ASCII names in the tests' own sources.
    target_compile_options(${name} PRIVATE /utf-8)
  endif()
  add_dependencies(unit_tests ${name})
  add_test(NAME ${name} COMMAND ${name})
endforeach()
