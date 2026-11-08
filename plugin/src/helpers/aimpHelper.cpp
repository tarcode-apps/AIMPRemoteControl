#include "aimpHelper.h"

#include <cctype>

#include "apiFileManager.h"
#include "apiMUI.h"

#ifdef _WIN32
#include <windows.h>
#endif

std::string GetPropertyAsString(IAIMPPropertyList *props, INT32 propertyId)
{
	if (!props)
		return {};
	IAIMPString *s = nullptr;
	if (Failed(props->GetValueAsObject(propertyId, IID_IAIMPString, reinterpret_cast<void **>(&s))) || !s)
		return {};
	std::string result = IAIMPStringToString(s);
	s->Release();
	return result;
}

std::string IAIMPStringToString(IAIMPString *s)
{
	if (!s)
		return {};
	const auto *data = s->GetData();
	const int length = s->GetLength();
	if (length <= 0)
		return {};

#ifdef _WIN32
	const int needed = ::WideCharToMultiByte(CP_UTF8, 0, data, length, nullptr, 0, nullptr, nullptr);
	std::string result(static_cast<size_t>(needed), '\0');
	::WideCharToMultiByte(CP_UTF8, 0, data, length, result.data(), needed, nullptr, nullptr);
	return result;
#else
	return std::string(data, data + length);
#endif
}

IAIMPString *StringToIAIMPString(IAIMPCore *core, const std::string &utf8)
{
	if (!core)
		return nullptr;
	IAIMPString *s = nullptr;
	if (Failed(core->CreateObject(IID_IAIMPString, reinterpret_cast<void **>(&s))) || !s)
		return nullptr;

#ifdef _WIN32
	const int needed = ::MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
	std::wstring wide(static_cast<size_t>(needed), L'\0');
	::MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), wide.data(), needed);
	s->SetData(const_cast<wchar_t *>(wide.c_str()), needed);
#else
	s->SetData(const_cast<char *>(utf8.c_str()), static_cast<int>(utf8.size()));
#endif
	return s;
}

std::string Localize(IAIMPCore *core, const std::string &keyPath, const std::string &fallback)
{
	IAIMPServiceMUI *mui = nullptr;
	if (!core || Failed(core->QueryInterface(IID_IAIMPServiceMUI, reinterpret_cast<void **>(&mui))))
		return fallback;

	std::string result = fallback;
	if (IAIMPString *key = StringToIAIMPString(core, keyPath))
	{
		IAIMPString *value = nullptr;
		if (Succeeded(mui->GetValue(key, &value)) && value)
		{
			result = IAIMPStringToString(value);
			value->Release();
		}
		key->Release();
	}
	mui->Release();
	return result;
}

std::string ToStringAndRelease(IAIMPString *s)
{
	if (!s)
		return {};
	std::string result = IAIMPStringToString(s);
	s->Release();
	return result;
}
