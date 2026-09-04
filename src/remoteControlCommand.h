#pragma once

#include <functional>
#include <map>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <string>
#include <utility>
#include <vector>

#include <nlohmann/json.hpp>

class RpcError : public std::runtime_error
{
public:
	RpcError(int code, const std::string &message) : std::runtime_error(message), FCode(code) {}
	int Code() const { return FCode; }

private:
	int FCode;
};

class LocalizedRpcError : public RpcError
{
public:
	LocalizedRpcError(int code, const std::string &key) : RpcError(code, key) {}
	const char *Key() const { return what(); }
};

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

class ApiError : public std::runtime_error
{
public:
	ApiError(int status, const std::string &code) : std::runtime_error(code), FStatus(status) {}
	int Status() const { return FStatus; }
	const char *Code() const { return what(); }

private:
	int FStatus;
};

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

class IRpcRegistrar
{
public:
	virtual ~IRpcRegistrar() = default;
	virtual void Add(const std::string &name, RpcMethod method) = 0;
	virtual void AddGet(const std::string &pathPattern, HttpGetHandler handler) = 0;
	virtual void AddUpload(const std::string &pathPattern, HttpUploadHandler handler) = 0;
	virtual void AddApi(HttpMethod method, const std::string &pathPattern, ApiHandler handler) = 0;
	virtual void AddEventStream(const std::string &pathPattern, EventStreamHandler handler) = 0;
};

class IRemoteControlCommand
{
public:
	virtual ~IRemoteControlCommand() = default;
	virtual void Register(IRpcRegistrar &rpc) = 0;
};
