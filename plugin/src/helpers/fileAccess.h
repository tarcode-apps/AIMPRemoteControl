#pragma once

#include <string>

// Whether the file could be deleted right now: it exists and nothing denies the
// deletion, be it the rights, a read-only volume or another process holding it.
bool CanDeleteFile(const std::string &utf8Path);
