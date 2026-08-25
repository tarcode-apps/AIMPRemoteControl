#pragma once

#include <functional>
#include <map>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <string>
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

class IRpcRegistrar
{
public:
	virtual ~IRpcRegistrar() = default;
	virtual void Add(const std::string &name, RpcMethod method) = 0;
	virtual void AddGet(const std::string &pathPattern, HttpGetHandler handler) = 0;
	virtual void AddUpload(const std::string &pathPattern, HttpUploadHandler handler) = 0;
};

class IRemoteControlCommand
{
public:
	virtual ~IRemoteControlCommand() = default;
	virtual void Register(IRpcRegistrar &rpc) = 0;
};
