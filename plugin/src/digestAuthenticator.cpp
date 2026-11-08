#include "digestAuthenticator.h"

#include <algorithm>
#include <charconv>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <utility>

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

	// RFC 7616 §3.4.6: the signed uri must name the resource the request line
	// does, which a proxy may rewrite on the way. Both are read as the server reads
	// a request, the path decoded and the query as parameters, so "/a?" is "/a"
	// and "%7B" is "%7b".
	std::multiset<std::pair<std::string, std::string>> Unordered(const httplib::Params &params)
	{
		std::multiset<std::pair<std::string, std::string>> out;
		for (const auto &[name, value] : params)
			out.emplace(name, value);
		return out;
	}

	bool SameResource(const std::string &digestUri, const httplib::Request &req)
	{
		std::string target = digestUri;
		// Android's DownloadManager signs the absolute URL ("http://host:port/path").
		if (const auto scheme = target.find("://"); scheme != std::string::npos)
		{
			const auto slash = target.find('/', scheme + 3);
			target = slash == std::string::npos ? std::string("/") : target.substr(slash);
		}
		target.erase(std::min(target.find('#'), target.size()));
		const auto question = target.find('?');
		httplib::Params params;
		if (question != std::string::npos)
			httplib::detail::parse_query_text(target.substr(question + 1), params);
		return httplib::decode_path_component(target.substr(0, question)) == req.path &&
			   Unordered(params) == Unordered(req.params);
	}

	// The eight hex digits of a Digest nonce count.
	std::optional<std::uint32_t> ParseNc(const std::string &text)
	{
		std::uint32_t value = 0;
		const auto [end, error] = std::from_chars(text.data(), text.data() + text.size(), value, 16);
		if (text.empty() || error != std::errc() || end != text.data() + text.size())
			return std::nullopt;
		return value;
	}

	bool EqualConstantTime(const std::string &a, const std::string &b)
	{
		unsigned char diff = a.size() == b.size() ? 0 : 1;
		for (std::size_t i = 0; i < a.size() && i < b.size(); ++i)
			diff |= static_cast<unsigned char>(a[i]) ^ static_cast<unsigned char>(b[i]);
		return diff == 0;
	}
}

DigestAuthenticator::DigestAuthenticator(Clock now) : FNow(std::move(now)) {}

std::int64_t DigestAuthenticator::NowSeconds() const
{
	return std::chrono::duration_cast<std::chrono::seconds>(FNow().time_since_epoch()).count();
}

void DigestAuthenticator::SetSettings(Settings::AuthSettings settings)
{
	// An empty key would sign nonces anyone can forge.
	if (settings.IsActive() && settings.NonceKey.empty())
		throw std::invalid_argument("authentication needs a nonce key");
	std::lock_guard lock(FMutex);
	FSettings = std::move(settings);
}

std::string DigestAuthenticator::NonceMac(const std::string &ts) const
{
	std::lock_guard lock(FMutex);
	return Md5Hex(ts + ":" + FSettings.NonceKey);
}

// nonce = <timestamp>:<MD5(timestamp:key)> — verifiable without state.
std::string DigestAuthenticator::MakeNonce() const
{
	const std::string ts = std::to_string(NowSeconds());
	return ts + ":" + NonceMac(ts);
}

int DigestAuthenticator::CheckNonce(const std::string &nonce) const
{
	const std::size_t colon = nonce.find(':');
	if (colon == std::string::npos)
		return 0;
	const std::string ts = nonce.substr(0, colon);
	const std::string mac = nonce.substr(colon + 1);
	if (!EqualConstantTime(mac, NonceMac(ts)))
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

bool DigestAuthenticator::IsRateLimited(const std::string &address) const
{
	std::lock_guard lock(FAttemptsMutex);
	const auto it = FLastFailure.find(address);
	return it != FLastFailure.end() &&
		   std::chrono::steady_clock::now() - it->second < FailedAttemptInterval;
}

void DigestAuthenticator::RecordFailure(const std::string &address) const
{
	const auto now = std::chrono::steady_clock::now();
	std::lock_guard lock(FAttemptsMutex);
	std::erase_if(FLastFailure, [&](const auto &entry)
				  { return now - entry.second > FailedAttemptRetention; });
	FLastFailure[address] = now;
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

	if (IsRateLimited(req.remote_addr))
	{
		Challenge(res, false);
		return false;
	}

	auto reject = [&]
	{
		RecordFailure(req.remote_addr);
		Challenge(res, false);
		return false;
	};

	const auto p = ParseDigestHeader(req.get_header_value("Authorization"));
	auto field = [&](const char *k) -> std::string
	{
		auto it = p.find(k);
		return it == p.end() ? std::string() : it->second;
	};

	if (field("username") != settings.Username || field("realm") != Settings::AuthSettings::Realm)
		return reject();

	// A malformed request rather than a guess at the password, so 400 as the RFC
	// has it: neither a challenge, on which a browser asks for the password
	// again, nor a failure that holds the address back.
	if (!SameResource(field("uri"), req))
	{
		res.status = 400;
		res.set_content("The signed uri names another resource", "text/plain");
		return false;
	}

	const std::string nonce = field("nonce");
	const int nonceState = CheckNonce(nonce);
	if (nonceState == 0)
		return reject();

	// RFC 7616 §3.4.1 with qop=auth, the only form taken: without qop (RFC 2069)
	// there is no nc to tell a replay by, and no client of ours sends one.
	//   response = MD5( HA1 : nonce : nc : cnonce : qop : HA2 ),  HA2 = MD5(method:uri)
	if (field("qop") != "auth")
		return reject();
	const std::optional<std::uint32_t> nc = ParseNc(field("nc"));
	if (!nc)
		return reject();
	const std::string ha2 = Md5Hex(req.method + ":" + field("uri"));
	const std::string expected =
		Md5Hex(settings.Ha1 + ":" + nonce + ":" + field("nc") + ":" + field("cnonce") + ":auth:" + ha2);
	if (!EqualConstantTime(expected, field("response")))
		return reject();

	if (nonceState == 2)
	{
		// Credentials are right but the nonce aged out: tell the client to
		// resend with a fresh one, without asking the user again.
		Challenge(res, true);
		return false;
	}

	// A header used before is a replay, or the app's own parallel requests
	// sharing an nc. Either way the request is not run: stale=true asks for a new
	// signature, which only the password gives. The app resends silently then,
	// where a plain challenge makes it fail with "Unauthorized" (both captured).
	// The one client that cannot sign anew is Android's DownloadManager, handed a
	// header made in advance by the app: a resumed download fails, by choice.
	if (!FirstUse(nonce, field("cnonce"), *nc))
	{
		Challenge(res, true);
		return false;
	}
	return true;
}

bool DigestAuthenticator::FirstUse(const std::string &nonce, const std::string &cnonce, std::uint32_t nc) const
{
	const std::int64_t now = NowSeconds();
	const std::int64_t lifetime = std::chrono::duration_cast<std::chrono::seconds>(NonceLifetime).count();
	std::lock_guard lock(FSeenMutex);
	if (now - FLastSeenPrune >= 60)
	{
		std::erase_if(FSeen, [&](const auto &entry)
					  { return now - entry.second.Issued > lifetime; });
		FLastSeenPrune = now;
	}
	SeenCounts &seen = FSeen[nonce + "\n" + cnonce];
	if (seen.Counts.empty())
		seen.Issued = std::stoll(nonce.substr(0, nonce.find(':')));
	return seen.Counts.insert(nc).second;
}
