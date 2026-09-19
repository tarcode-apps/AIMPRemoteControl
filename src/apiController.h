#pragma once

#include <functional>
#include <map>
#include <optional>
#include <string_view>
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
};

using HttpGetHandler = std::function<std::optional<HttpContent>(const std::vector<std::string> &pathMatches)>;

struct HttpUploadedFile
{
	std::string Name;
	std::string FileName;
	std::string ContentType;
	std::string_view Content;
};

using HttpUploadHandler = std::function<int(const std::vector<std::string> &pathMatches, const std::vector<HttpUploadedFile> &files)>;

struct ApiRequest
{
	std::vector<std::string> PathMatches;
	std::multimap<std::string, std::string> Query;
	nlohmann::json Body;
};

using ApiHandler = std::function<nlohmann::json(const ApiRequest &request)>;

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
	virtual void MapEventStream(const std::string &pathPattern, EventStreamHandler handler) = 0;
};

class IApiController
{
public:
	virtual ~IApiController() = default;
	virtual void Register(IEndpointRouteBuilder &endpoints) = 0;
};
