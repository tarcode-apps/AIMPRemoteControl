#pragma once

#include <exception>
#include <functional>
#include <stdexcept>
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

	// The plugin refuses to initialize without the service, so this is a bug, not a
	// condition to work around: running `fn` here would touch the SDK off its thread.
	inline IAIMPServiceThreads *RequireThreadsService(IAIMPCore *core)
	{
		IAIMPServiceThreads *svc = AcquireThreadsService(core);
		if (!svc)
			throw std::logic_error("IAIMPServiceThreads is not available");
		return svc;
	}

	// Runs `fn` on the main thread and waits for it, throwing here what it threw. The
	// player swallows whatever escapes a task, an access violation inside it included,
	// so a task that did not get to its end is an error too, never a default result.
	inline void RunAndWait(IAIMPCore *core, const std::function<void()> &fn)
	{
		std::exception_ptr error;
		bool completed = false;
		auto *svc = RequireThreadsService(core);
		auto *task = new FunctionTask([&]
									  {
			try
			{
				fn();
				completed = true;
			}
			catch (...)
			{
				error = std::current_exception();
			} });
		task->AddRef();
		svc->ExecuteInMainThread(task, AIMP_SERVICE_THREADS_FLAGS_WAITFOR);
		task->Release();
		svc->Release();
		if (error)
			std::rethrow_exception(error);
		if (!completed)
			throw std::runtime_error("The player did not complete a task on its main thread");
	}
}

template <typename Fn>
auto RunOnMainThread(IAIMPCore *core, Fn &&fn) -> std::invoke_result_t<Fn>
{
	using R = std::invoke_result_t<Fn>;
	if constexpr (std::is_void_v<R>)
		detail::RunAndWait(core, [&]
						   { fn(); });
	else
	{
		R result{};
		detail::RunAndWait(core, [&]
						   { result = fn(); });
		return result;
	}
}

inline void PostToMainThread(IAIMPCore *core, std::function<void()> fn)
{
	auto *svc = detail::RequireThreadsService(core);
	auto *task = new detail::FunctionTask(std::move(fn));
	task->AddRef();
	svc->ExecuteInMainThread(task, 0);
	task->Release();
	svc->Release();
}
