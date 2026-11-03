// DigestAuthenticator: who gets in, who gets a challenge, and when a nonce is
// stale. The clock is the test's, so a nonce ages without waiting for it.
#include "digestAuthenticator.h"

#include <httplib.h>

#include <string>

#include "check.h"
#include "md5.h"

namespace
{
	const std::string realm = Settings::AuthSettings::Realm;
	const std::string username = "listener";
	const std::string password = "secret word";

	std::chrono::system_clock::time_point now = std::chrono::system_clock::now();

	// Failed credentials hold a client address back for a second, so each case
	// asks from an address of its own.
	std::string NextAddress()
	{
		static int last = 0;
		return "10.0.0." + std::to_string(++last);
	}

	struct Request
	{
		std::string Method = "GET";
		std::string Target = "/api/v1/player";
		std::string Address = NextAddress();
		std::string Authorization;
	};

	struct Answer
	{
		bool Authorized;
		int Status;
		std::string Challenge;
	};

	Answer Ask(const DigestAuthenticator &auth, const Request &request)
	{
		httplib::Request req;
		req.method = request.Method;
		req.target = request.Target;
		req.path = request.Target.substr(0, request.Target.find('?'));
		req.remote_addr = request.Address;
		if (!request.Authorization.empty())
			req.headers.emplace("Authorization", request.Authorization);
		httplib::Response res;
		const bool authorized = auth.Authorize(req, res);
		return {authorized, res.status, res.get_header_value("WWW-Authenticate")};
	}

	std::string Field(const std::string &challenge, const std::string &name)
	{
		const std::string key = name + "=\"";
		const auto start = challenge.find(key);
		if (start == std::string::npos)
			return {};
		const auto end = challenge.find('"', start + key.size());
		return challenge.substr(start + key.size(), end - start - key.size());
	}

	// A nonce handed out in a challenge right now.
	std::string FreshNonce(const DigestAuthenticator &auth)
	{
		return Field(Ask(auth, {}).Challenge, "nonce");
	}

	struct Credentials
	{
		std::string Username = username;
		std::string Password = password;
		std::string Nonce;
		std::string Uri; // what the client signs; the request target unless told
		bool Qop = true; // false: the RFC 2069 form without qop, nc and cnonce
	};

	std::string Authorization(const Request &request, const Credentials &credentials)
	{
		const std::string uri = credentials.Uri.empty() ? request.Target : credentials.Uri;
		const std::string ha1 = Md5Hex(credentials.Username + ":" + realm + ":" + credentials.Password);
		const std::string ha2 = Md5Hex(request.Method + ":" + uri);
		const std::string common = "Digest username=\"" + credentials.Username + "\", realm=\"" + realm +
								   "\", nonce=\"" + credentials.Nonce + "\", uri=\"" + uri + "\", ";
		if (!credentials.Qop)
			return common + "response=\"" + Md5Hex(ha1 + ":" + credentials.Nonce + ":" + ha2) + "\"";
		const std::string nc = "00000001", cnonce = "0a4f113b";
		const std::string response = Md5Hex(ha1 + ":" + credentials.Nonce + ":" + nc + ":" + cnonce + ":auth:" + ha2);
		return common + "qop=auth, nc=" + nc + ", cnonce=\"" + cnonce + "\", response=\"" + response + "\"";
	}

	Answer AskSigned(const DigestAuthenticator &auth, Request request, Credentials credentials)
	{
		if (credentials.Nonce.empty())
			credentials.Nonce = FreshNonce(auth);
		request.Authorization = Authorization(request, credentials);
		return Ask(auth, request);
	}
}

int main()
{
	DigestAuthenticator open([] { return now; });
	Check("without authentication everyone is let in", Ask(open, {}).Authorized);

	DigestAuthenticator auth([] { return now; });
	auth.SetSettings({true, username, Md5Hex(username + ":" + realm + ":" + password)});

	const Answer challenge = Ask(auth, {});
	Check("a request without credentials is challenged", !challenge.Authorized && challenge.Status == 401);
	Check("the challenge names the realm, qop and MD5",
		  Field(challenge.Challenge, "realm") == realm && Field(challenge.Challenge, "qop") == "auth" &&
			  challenge.Challenge.find("algorithm=MD5") != std::string::npos &&
			  challenge.Challenge.find("stale") == std::string::npos);

	Check("right credentials pass", AskSigned(auth, {}, {}).Authorized);
	Check("right credentials without qop pass", AskSigned(auth, {}, {.Qop = false}).Authorized);
	Check("a target with a query passes", AskSigned(auth, {.Target = "/api/v1/files?path=C%3A%5C"}, {}).Authorized);
	Check("a POST passes", AskSigned(auth, {.Method = "POST", .Target = "/RPC_JSON"}, {}).Authorized);
	// Android's DownloadManager signs the absolute URL.
	Check("a URI signed with scheme and host passes",
		  AskSigned(auth, {}, {.Uri = "http://192.168.1.2:3333/api/v1/player"}).Authorized);

	Check("a wrong password is refused", !AskSigned(auth, {}, {.Password = "wrong"}).Authorized);
	Check("another user is refused", !AskSigned(auth, {}, {.Username = "someone"}).Authorized);
	Check("another URI is refused", !AskSigned(auth, {}, {.Uri = "/api/v1/queue"}).Authorized);
	Check("a forged nonce is refused", !AskSigned(auth, {}, {.Nonce = "1:00000000000000000000000000000000"}).Authorized);
	Check("a nonce without a timestamp is refused", !AskSigned(auth, {}, {.Nonce = "garbage"}).Authorized);

	const Request limited;
	Check("after a failure", !AskSigned(auth, limited, {.Password = "wrong"}).Authorized);
	Check("the same address is challenged for a second, even with right credentials",
		  !AskSigned(auth, limited, {}).Authorized);
	Check("while another address passes", AskSigned(auth, {}, {}).Authorized);

	const std::string nonce = FreshNonce(auth);
	now += std::chrono::minutes(14);
	Check("a nonce passes for its lifetime", AskSigned(auth, {}, {.Nonce = nonce}).Authorized);
	now += std::chrono::minutes(2);
	const Answer stale = AskSigned(auth, {}, {.Nonce = nonce});
	Check("an aged nonce with right credentials is challenged as stale",
		  !stale.Authorized && stale.Status == 401 && stale.Challenge.find("stale=true") != std::string::npos);
	const Answer wrongStale = AskSigned(auth, {}, {.Password = "wrong", .Nonce = nonce});
	Check("an aged nonce with wrong credentials is not called stale",
		  !wrongStale.Authorized && wrongStale.Challenge.find("stale") == std::string::npos);
	Check("a fresh nonce passes again", AskSigned(auth, {}, {}).Authorized);

	return Finish();
}
