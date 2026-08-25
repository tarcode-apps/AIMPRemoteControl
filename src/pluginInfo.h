#pragma once

#define PLUGIN_NAME "AIMP Remote Control"
#define PLUGIN_AUTHOR "Artem Tarasov"
#define PLUGIN_DESCRIPTION "Alternate Remote control server for Android devices"
#define PLUGIN_LICENSE "MIT License"

#define PLUGIN_URL_GITHUB "https://github.com/tarcode-apps/AIMPRemoteControl"
#define PLUGIN_URL_APP "https://aimpremote.blogspot.com"
#define PLUGIN_URL_FORUM "https://4pda.to/forum/index.php?showtopic=499539"

#define PLUGIN_VERSION_MAJOR 1
#define PLUGIN_VERSION_MINOR 3
#define PLUGIN_VERSION_PATCH 0
#define PLUGIN_VERSION_BUILD 0

#define PLUGIN_STRINGIZE_(x) #x
#define PLUGIN_STRINGIZE(x) PLUGIN_STRINGIZE_(x)
#define PLUGIN_VERSION_STRING                                                         \
	PLUGIN_STRINGIZE(PLUGIN_VERSION_MAJOR) "." PLUGIN_STRINGIZE(PLUGIN_VERSION_MINOR) "." \
	PLUGIN_STRINGIZE(PLUGIN_VERSION_PATCH) "." PLUGIN_STRINGIZE(PLUGIN_VERSION_BUILD)

#define PLUGIN_COPYRIGHT "Copyright (c) " PLUGIN_STRINGIZE(PLUGIN_BUILD_YEAR) " " PLUGIN_AUTHOR ". " PLUGIN_LICENSE "."

#define PLUGIN_AUTH_REALM "AIMP Remote Control"
#define PLUGIN_REMOTE_CONTROL_VERSION "1.2.0.5"
