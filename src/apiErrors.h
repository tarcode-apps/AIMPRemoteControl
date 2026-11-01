#pragma once

#include <stdexcept>
#include <string>

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

class ApiError : public std::runtime_error
{
public:
	// `details` are fields the error object carries besides `code` and `message`.
	ApiError(int status, const std::string &code, nlohmann::json details = nlohmann::json::object())
		: std::runtime_error(code), FStatus(status), FDetails(std::move(details)) {}
	int Status() const { return FStatus; }
	const char *Code() const { return what(); }
	const nlohmann::json &Details() const { return FDetails; }

private:
	int FStatus;
	nlohmann::json FDetails;
};
