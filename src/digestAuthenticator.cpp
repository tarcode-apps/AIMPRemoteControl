#include "digestAuthenticator.h"

#include <map>

#include <httplib.h>

#include "md5.h"

namespace
{
	std::map<std::string, std::string> ParseDigestHeader(const std::string &header)
	{
		httplib::Response scratch;
		scratch.set_header("WWW-Authenticate", header);
		std::map<std::string, std::string> out;
		httplib::detail::parse_www_authenticate(scratch, out, false);
		return out;
	}

	std::string RequestPathOf(const std::string &digestUri)
	{
		const auto scheme = digestUri.find("://");
		if (scheme == std::string::npos)
			return digestUri;
		const auto slash = digestUri.find('/', scheme + 3);
		return slash == std::string::npos ? std::string("/") : digestUri.substr(slash);
	}

	bool EqualConstantTime(const std::string &a, const std::string &b)
	{
		unsigned char diff = a.size() == b.size() ? 0 : 1;
		for (std::size_t i = 0; i < a.size() && i < b.size(); ++i)
			diff |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
		return diff == 0;
	}

	std::int64_t NowSeconds()
	{
		return std::chrono::duration_cast<std::chrono::seconds>(
				   std::chrono::system_clock::now().time_since_epoch())
			.count();
	}
}

DigestAuthenticator::DigestAuthenticator() = default;

std::string DigestAuthenticator::NonceSecret() const
{
	std::lock_guard lock(FMutex);
	return Md5Hex("nonce:" + FSettings.Ha1);
}

void DigestAuthenticator::SetSettings(Settings::AuthSettings settings)
{
	std::lock_guard lock(FMutex);
	FSettings = std::move(settings);
}

// nonce = <timestamp>:<MD5(timestamp:secret)> — verifiable without state.
std::string DigestAuthenticator::MakeNonce() const
{
	const std::string ts = std::to_string(NowSeconds());
	return ts + ":" + Md5Hex(ts + ":" + NonceSecret());
}

int DigestAuthenticator::CheckNonce(const std::string &nonce) const
{
	const std::size_t colon = nonce.find(':');
	if (colon == std::string::npos)
		return 0;
	const std::string ts = nonce.substr(0, colon);
	if (nonce.substr(colon + 1) != Md5Hex(ts + ":" + NonceSecret()))
		return 0;

	std::int64_t issued = 0;
	try
	{
		issued = std::stoll(ts);
	}
	catch (...)
	{
		return 0;
	}
	return (NowSeconds() - issued) <= std::chrono::duration_cast<std::chrono::seconds>(NonceLifetime).count() ? 1 : 2;
}

void DigestAuthenticator::Challenge(httplib::Response &res, bool stale) const
{
	std::string header = std::string("Digest realm=\"") + Settings::AuthSettings::Realm +
						 "\", qop=\"auth\", algorithm=MD5, nonce=\"" + MakeNonce() + "\"";
	if (stale)
		header += ", stale=true";
	res.status = 401;
	res.set_header("WWW-Authenticate", header);
	res.set_content("Unauthorized", "text/plain");
}

bool DigestAuthenticator::Authorize(const httplib::Request &req, httplib::Response &res) const
{
	Settings::AuthSettings settings;
	{
		std::lock_guard lock(FMutex);
		settings = FSettings;
	}
	if (!settings.IsActive())
		return true;

	if (!req.has_header("Authorization"))
	{
		Challenge(res, false);
		return false;
	}

	const auto p = ParseDigestHeader(req.get_header_value("Authorization"));
	auto field = [&](const char *k) -> std::string
	{
		auto it = p.find(k);
		return it == p.end() ? std::string() : it->second;
	};

	if (field("username") != settings.Username || field("realm") != Settings::AuthSettings::Realm)
	{
		Challenge(res, false);
		return false;
	}

	// Android's DownloadManager signs the absolute URL ("http://host:port/path")
	const std::string signedUri = RequestPathOf(field("uri"));
	if (signedUri != req.path && signedUri != req.target)
	{
		Challenge(res, false);
		return false;
	}

	const std::string nonce = field("nonce");
	const int nonceState = CheckNonce(nonce);
	if (nonceState == 0)
	{
		Challenge(res, false);
		return false;
	}

	// RFC 7616 §3.4.1 with qop=auth:
	//   response = MD5( HA1 : nonce : nc : cnonce : qop : HA2 ),  HA2 = MD5(method:uri)
	// Without qop (RFC 2069 legacy): response = MD5( HA1 : nonce : HA2 ).
	const std::string ha2 = Md5Hex(req.method + ":" + field("uri"));
	const std::string qop = field("qop");
	std::string expected;
	if (qop.empty())
		expected = Md5Hex(settings.Ha1 + ":" + nonce + ":" + ha2);
	else if (qop == "auth")
		expected = Md5Hex(settings.Ha1 + ":" + nonce + ":" + field("nc") + ":" + field("cnonce") + ":auth:" + ha2);
	else
	{
		Challenge(res, false);
		return false;
	}

	if (!EqualConstantTime(expected, field("response")))
	{
		Challenge(res, false);
		return false;
	}

	if (nonceState == 2)
	{
		// Credentials are right but the nonce aged out: tell the client to
		// resend with a fresh one, without asking the user again.
		Challenge(res, true);
		return false;
	}
	return true;
}
