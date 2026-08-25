#pragma once

#include <chrono>
#include <mutex>
#include <string>

#include "settings.h"

namespace httplib
{
	struct Request;
	struct Response;
}

class DigestAuthenticator
{
public:
	DigestAuthenticator();

	void SetSettings(Settings::AuthSettings settings);
	bool Authorize(const httplib::Request &req, httplib::Response &res) const;

private:
	static constexpr std::chrono::minutes NonceLifetime{15};

	std::string NonceSecret() const;
	std::string MakeNonce() const;
	// 0 = invalid, 1 = valid, 2 = well-formed but expired (challenge with stale=true)
	int CheckNonce(const std::string &nonce) const;
	void Challenge(httplib::Response &res, bool stale) const;

	mutable std::mutex FMutex;
	Settings::AuthSettings FSettings;
};
