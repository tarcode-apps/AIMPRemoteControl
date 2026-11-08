#pragma once

#include <cstdint>
#include <string>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiObjects.h"
#include "apiPlaylists.h"


// A service of the core, null when it has none; released by the caller.
template <typename T>
T *AcquireService(IAIMPCore *core, const GUID &iid)
{
	T *service = nullptr;
	if (Failed(core->QueryInterface(iid, reinterpret_cast<void **>(&service))) || !service)
		return nullptr;
	return service;
}

std::string IAIMPStringToString(IAIMPString *s);
// The text of a string the caller owned, released.
std::string ToStringAndRelease(IAIMPString *s);
IAIMPString *StringToIAIMPString(IAIMPCore *core, const std::string &utf8);

std::string GetPropertyAsString(IAIMPPropertyList *props, INT32 propertyId);
std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback);
