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

		bool IsActive() const { return Enabled && !Username.empty() && !Ha1.empty(); }

		static std::string ComputeHa1(const std::string &username, const std::string &password);
	};

	struct FeatureSettings
	{
		bool PhysicalDeletion = false;
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
