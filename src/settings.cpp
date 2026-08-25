#include "settings.h"

#include "apiCore.h"
#include "aimpHelper.h"
#include "md5.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <filesystem>
#include <fstream>

#ifdef _WIN32
#include <shlobj.h>
#endif

namespace
{
	class ConfigStore
	{
	public:
		explicit ConfigStore(IAIMPCore *core) : FCore(core)
		{
			if (core)
				core->QueryInterface(IID_IAIMPServiceConfig, reinterpret_cast<void **>(&FConfig));
		}
		~ConfigStore()
		{
			if (FConfig)
				FConfig->Release();
		}

		explicit operator bool() const { return FConfig != nullptr; }

		std::string GetString(const char *key, const std::string &fallback = {}) const
		{
			IAIMPString *k = StringToIAIMPString(FCore, key);
			if (!k)
				return fallback;
			IAIMPString *v = nullptr;
			std::string result = fallback;
			if (Succeeded(FConfig->GetValueAsString(k, &v)) && v)
			{
				result = IAIMPStringToString(v);
				v->Release();
			}
			k->Release();
			return result;
		}

		int GetInt(const char *key, int fallback) const
		{
			IAIMPString *k = StringToIAIMPString(FCore, key);
			if (!k)
				return fallback;
			INT32 v = fallback;
			if (Failed(FConfig->GetValueAsInt32(k, &v)))
				v = fallback;
			k->Release();
			return v;
		}

		void SetString(const char *key, const std::string &value)
		{
			IAIMPString *k = StringToIAIMPString(FCore, key);
			IAIMPString *v = StringToIAIMPString(FCore, value);
			if (k && v)
				FConfig->SetValueAsString(k, v);
			if (v)
				v->Release();
			if (k)
				k->Release();
		}

		void Delete(const char *key)
		{
			if (IAIMPString *k = StringToIAIMPString(FCore, key))
			{
				FConfig->Delete(k);
				k->Release();
			}
		}

		void SetInt(const char *key, int value)
		{
			IAIMPString *k = StringToIAIMPString(FCore, key);
			if (!k)
				return;
			FConfig->SetValueAsInt32(k, value);
			k->Release();
		}

	private:
		IAIMPCore *FCore;
		IAIMPServiceConfig *FConfig = nullptr;
	};

	constexpr const char *KeyAuthEnabled = R"(AIMPRemoteControl\Auth\Enabled)";
	constexpr const char *KeyAuthUsername = R"(AIMPRemoteControl\Auth\Username)";
	constexpr const char *KeyAuthHa1 = R"(AIMPRemoteControl\Auth\HA1)";
	constexpr const char *KeyFeatPhysicalDeletion = R"(AIMPRemoteControl\Features\PhysicalDeletion)";
	constexpr const char *KeyFeatUploadTracks = R"(AIMPRemoteControl\Features\UploadTracks)";
	constexpr const char *KeyFeatUploadFolder = R"(AIMPRemoteControl\Features\UploadFolder)";
	constexpr const char *KeyFeatScheduler = R"(AIMPRemoteControl\Features\Scheduler)";
	constexpr const char *KeyFeatBrowseFiles = R"(AIMPRemoteControl\Features\BrowseFiles)";
	constexpr const char *KeyNetExcludedInterfaces = R"(AIMPRemoteControl\Network\ExcludedInterfaces)";
	constexpr char InterfaceListSeparator = '|';

	std::vector<std::string> SplitList(const std::string &joined, char separator)
	{
		std::vector<std::string> items;
		std::size_t start = 0;
		while (start <= joined.size())
		{
			const std::size_t end = joined.find(separator, start);
			const std::string item = joined.substr(start, end == std::string::npos ? std::string::npos : end - start);
			if (!item.empty())
				items.push_back(item);
			if (end == std::string::npos)
				break;
			start = end + 1;
		}
		return items;
	}

	std::string JoinList(const std::vector<std::string> &items, char separator)
	{
		std::string joined;
		for (const std::string &item : items)
			joined += (joined.empty() ? "" : std::string(1, separator)) + item;
		return joined;
	}

	std::string CanonicalFolder(const std::string &folder)
	{
		std::string s = std::filesystem::path(folder).lexically_normal().generic_string();
		while (s.size() > 1 && s.back() == '/')
			s.pop_back();
#ifdef _WIN32
		std::transform(s.begin(), s.end(), s.begin(), [](unsigned char c)
					   { return static_cast<char>(std::tolower(c)); });
#endif
		return s;
	}
}

std::string Settings::AuthSettings::ComputeHa1(const std::string &username, const std::string &password)
{
	return Md5Hex(username + ":" + Realm + ":" + password);
}

Settings Settings::Load(IAIMPCore *core)
{
	Settings s;
	ConfigStore store(core);
	if (!store)
		return s;

	s.Auth.Enabled = store.GetInt(KeyAuthEnabled, 0) != 0;
	s.Auth.Username = store.GetString(KeyAuthUsername);
	s.Auth.Ha1 = store.GetString(KeyAuthHa1);
	s.Features.PhysicalDeletion = store.GetInt(KeyFeatPhysicalDeletion, 0) != 0;
	s.Features.UploadTracks = store.GetInt(KeyFeatUploadTracks, 0) != 0;
	s.Features.UploadFolder = Settings::FeatureSettings::UploadFolderForStorage(store.GetString(KeyFeatUploadFolder));
	s.Features.Scheduler = store.GetInt(KeyFeatScheduler, 0) != 0;
	s.Features.BrowseFiles = store.GetInt(KeyFeatBrowseFiles, 0) != 0;
	s.Network.ExcludedInterfaces = SplitList(store.GetString(KeyNetExcludedInterfaces), InterfaceListSeparator);
	return s;
}

void Settings::Save(IAIMPCore *core) const
{
	ConfigStore store(core);
	if (!store)
		return;

	store.SetInt(KeyAuthEnabled, Auth.Enabled ? 1 : 0);
	store.SetString(KeyAuthUsername, Auth.Username);
	store.SetString(KeyAuthHa1, Auth.Ha1);
	store.SetInt(KeyFeatPhysicalDeletion, Features.PhysicalDeletion ? 1 : 0);
	store.SetInt(KeyFeatUploadTracks, Features.UploadTracks ? 1 : 0);
	store.SetString(KeyFeatUploadFolder, Settings::FeatureSettings::UploadFolderForStorage(Features.UploadFolder));
	store.SetInt(KeyFeatScheduler, Features.Scheduler ? 1 : 0);
	store.SetInt(KeyFeatBrowseFiles, Features.BrowseFiles ? 1 : 0);
	if (Network.ExcludedInterfaces.empty())
		store.Delete(KeyNetExcludedInterfaces);
	else
		store.SetString(KeyNetExcludedInterfaces, JoinList(Network.ExcludedInterfaces, InterfaceListSeparator));
}

std::string Settings::FeatureSettings::DefaultUploadFolder()
{
#ifdef _WIN32
	std::string result;
	PWSTR path = nullptr;
	if (SUCCEEDED(::SHGetKnownFolderPath(FOLDERID_Music, KF_FLAG_DEFAULT, nullptr, &path)) && path)
	{
		const int needed = ::WideCharToMultiByte(CP_UTF8, 0, path, -1, nullptr, 0, nullptr, nullptr);
		if (needed > 1)
		{
			result.resize(static_cast<size_t>(needed) - 1);
			::WideCharToMultiByte(CP_UTF8, 0, path, -1, result.data(), needed, nullptr, nullptr);
		}
	}
	if (path)
		::CoTaskMemFree(path);
	return result;
#else
	// The XDG user-dirs standard (freedesktop.org): ~/.config/user-dirs.dirs
	// holds XDG_MUSIC_DIR="$HOME/Music" and desktops create it on first login.
	// Headless/minimal systems have neither the file nor ~/Music, so fall back
	// to ~/Music only if it exists, otherwise to the home directory itself.
	const char *home = std::getenv("HOME");
	const std::string homeDir = home ? home : "";
	std::ifstream dirs(homeDir + "/.config/user-dirs.dirs");
	for (std::string line; std::getline(dirs, line);)
	{
		const std::string prefix = "XDG_MUSIC_DIR=\"";
		if (line.rfind(prefix, 0) != 0 || line.size() < prefix.size() + 1)
			continue;
		std::string value = line.substr(prefix.size(), line.size() - prefix.size() - 1);
		const std::string homeVar = "$HOME";
		if (value.rfind(homeVar, 0) == 0)
			value = homeDir + value.substr(homeVar.size());
		return value;
	}
	std::error_code ec;
	if (std::filesystem::is_directory(homeDir + "/Music", ec))
		return homeDir + "/Music";
	return homeDir;
#endif
}

std::string Settings::FeatureSettings::EffectiveUploadFolder() const
{
	return UploadFolder.empty() ? DefaultUploadFolder() : UploadFolder;
}

std::string Settings::FeatureSettings::UploadFolderForStorage(const std::string &folder)
{
	if (folder.empty() || CanonicalFolder(folder) == CanonicalFolder(DefaultUploadFolder()))
		return {};
	return folder;
}
