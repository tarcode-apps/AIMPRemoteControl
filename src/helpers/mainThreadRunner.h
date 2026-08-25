#pragma once

#include <functional>
#include <type_traits>
#include <utility>

#include "apiCore.h"
#include "apiThreading.h"
#include "IUnknownImpl.h"

namespace detail
{
	class FunctionTask : public IUnknownImpl<IAIMPTask>
	{
	public:
		explicit FunctionTask(std::function<void()> fn) : FFn(std::move(fn)) {}
		void WINAPI Execute(IAIMPTaskOwner *) override { FFn(); }

	private:
		std::function<void()> FFn;
	};

	inline IAIMPServiceThreads *AcquireThreadsService(IAIMPCore *core)
	{
		if (!core)
			return nullptr;
		IAIMPServiceThreads *svc = nullptr;
		if (Failed(core->QueryInterface(IID_IAIMPServiceThreads, reinterpret_cast<void **>(&svc))))
			return nullptr;
		return svc;
	}
}

template <typename Fn>
auto RunOnMainThread(IAIMPCore *core, Fn &&fn) -> std::invoke_result_t<Fn>
{
	using R = std::invoke_result_t<Fn>;
	auto *svc = detail::AcquireThreadsService(core);
	if (!svc)
	{
		if constexpr (std::is_void_v<R>)
		{
			fn();
			return;
		}
		else
		{
			return fn();
		}
	}

	if constexpr (std::is_void_v<R>)
	{
		auto *task = new detail::FunctionTask([&]()
											  { fn(); });
		task->AddRef();
		svc->ExecuteInMainThread(task, AIMP_SERVICE_THREADS_FLAGS_WAITFOR);
		task->Release();
		svc->Release();
	}
	else
	{
		R result{};
		auto *task = new detail::FunctionTask([&]()
											  { result = fn(); });
		task->AddRef();
		svc->ExecuteInMainThread(task, AIMP_SERVICE_THREADS_FLAGS_WAITFOR);
		task->Release();
		svc->Release();
		return result;
	}
}

inline void PostToMainThread(IAIMPCore *core, std::function<void()> fn)
{
	auto *svc = detail::AcquireThreadsService(core);
	if (!svc)
	{
		fn();
		return;
	}
	auto *task = new detail::FunctionTask(std::move(fn));
	task->AddRef();
	svc->ExecuteInMainThread(task, 0);
	task->Release();
	svc->Release();
}
