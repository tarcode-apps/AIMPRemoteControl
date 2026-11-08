#pragma once

#include <mutex>
#include <string>
#include <vector>

#include "pluginInfo.h"

class IAIMPCore;

struct Settings
{
	struct AuthSettings
	{
		static constexpr const char *Realm = PLUGIN_AUTH_REALM;

		bool Enabled = false;
		std::string Username;
		std::string Ha1;
		// Signs the Digest nonces. Random rather than derived from the password,
		// so a challenge tells nothing about it, and kept in the profile, so a
		// nonce stays valid across restarts as the app needs.
		std::string NonceKey;

		bool IsActive() const { return Enabled && !Username.empty() && !Ha1.empty(); }

		static std::string ComputeHa1(const std::string &username, const std::string &password);
		static std::string NewNonceKey();
	};

	struct FeatureSettings
	{
		bool PhysicalDeletion = false;
		// On unless turned off: the original plugin always let the app download.
		bool DownloadTracks = true;
		bool UploadTracks = false;
		bool Scheduler = false;
		bool BrowseFiles = false;
		std::string UploadFolder;

		static std::string DefaultUploadFolder();
		std::string EffectiveUploadFolder() const;
		static std::string UploadFolderForStorage(const std::string &folder);
	};

	struct NetworkSettings
	{
		std::vector<std::string> ExcludedInterfaces;
	};

	AuthSettings Auth;
	FeatureSettings Features;
	NetworkSettings Network;

	static Settings Load(IAIMPCore *core);
	void Save(IAIMPCore *core) const;
};

class SharedSettings
{
public:
	Settings Get() const
	{
		std::lock_guard lock(FMutex);
		return FSettings;
	}
	void Set(const Settings &settings)
	{
		std::lock_guard lock(FMutex);
		FSettings = settings;
	}

private:
	mutable std::mutex FMutex;
	Settings FSettings;
};
