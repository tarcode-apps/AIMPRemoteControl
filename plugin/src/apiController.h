#pragma once

#include <cstddef>
#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

using RpcMethod = std::function<nlohmann::json(const nlohmann::json &params)>;

struct HttpContent
{
	std::string ContentType;
	std::string Body;
	std::string FilePath;
	std::map<std::string, std::string> Headers;
	int Status = 200;
};

// A file part of a multipart upload, as its headers name it.
struct UploadPart
{
	std::string Name;
	std::string FileName;
	std::string ContentType;
};

// The largest body an upload endpoint takes: 16 GB, or what a 32-bit size_t can
// count, which the HTTP library keeps body lengths in.
constexpr std::uint64_t MaxUploadSize = SIZE_MAX < (16ull << 30) ? SIZE_MAX : (16ull << 30);
// The most parts an upload may have, a folder of a whole music library among
// them; each is a file on disk.
constexpr std::size_t MaxUploadParts = 100000;

// The body of an upload, read from the connection only when the handler asks:
// a refusal reads nothing, and the files go where the handler writes them as
// they arrive instead of through memory.
class IUploadBody
{
public:
	virtual ~IUploadBody() = default;
	// The size the client declared, 0 when it did not.
	virtual std::uint64_t DeclaredSize() const = 0;
	// Hands every file part to `begin`, then its content to `write` piece by
	// piece; either may refuse, which stops the reading. False when the body
	// could not be read to its end.
	virtual bool ReadFiles(const std::function<bool(const UploadPart &part)> &begin,
						   const std::function<bool(const char *data, std::size_t size)> &write) = 0;
};

using HttpUploadHandler = std::function<int(const std::vector<std::string> &pathMatches, IUploadBody &body)>;

struct ApiRequest
{
	std::vector<std::string> PathMatches;
	std::multimap<std::string, std::string> Query;
	nlohmann::json Body;
};

using ApiHandler = std::function<nlohmann::json(const ApiRequest &request)>;

// A multipart upload; an ApiError is answered like one of an ApiHandler.
using ApiUploadHandler = std::function<nlohmann::json(const ApiRequest &request, IUploadBody &body)>;

// Nullopt is a plain 404; an ApiError is answered like one of an ApiHandler.
using HttpGetHandler = std::function<std::optional<HttpContent>(const ApiRequest &request)>;

enum class HttpMethod
{
	Get,
	Post,
	Put,
	Patch,
	Delete
};

class IEventStream
{
public:
	virtual ~IEventStream() = default;
	virtual bool Send(const std::string &event, const std::string &data) = 0;
	virtual bool Ping() = 0;
};

using EventStreamHandler = std::function<void(IEventStream &stream)>;

class IEndpointRouteBuilder
{
public:
	virtual ~IEndpointRouteBuilder() = default;
	virtual void MapRpc(const std::string &name, RpcMethod method) = 0;
	virtual void MapGet(const std::string &pathPattern, HttpGetHandler handler) = 0;
	virtual void MapUpload(const std::string &pathPattern, HttpUploadHandler handler) = 0;
	virtual void MapApi(HttpMethod method, const std::string &pathPattern, ApiHandler handler) = 0;
	virtual void MapApiUpload(const std::string &pathPattern, ApiUploadHandler handler) = 0;
	virtual void MapEventStream(const std::string &pathPattern, EventStreamHandler handler) = 0;
};

class IApiController
{
public:
	virtual ~IApiController() = default;
	virtual void Register(IEndpointRouteBuilder &endpoints) = 0;
};
