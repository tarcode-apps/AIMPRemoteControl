#pragma once

#include <stdexcept>
#include <string>

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
	ApiError(int status, const std::string &code) : std::runtime_error(code), FStatus(status) {}
	int Status() const { return FStatus; }
	const char *Code() const { return what(); }

private:
	int FStatus;
};
