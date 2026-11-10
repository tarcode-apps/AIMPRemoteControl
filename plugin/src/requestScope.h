#pragma once

#include <functional>
#include <optional>
#include <utility>

// What a handler knows of the request it answers beyond its arguments. The
// server sets it on the worker thread before the handler runs; every worker
// belongs to one listener, so it always describes the request at hand.
namespace requestScope
{
	// Whether the request is no longer worth answering: its client went away, or
	// the listener it came through is closing, as when its network interface
	// went away. A long wait ends early then, so that neither a gone client nor a
	// closing listener waits out a ten-minute long poll.
	bool Cancelled();

	// A place among the requests that stay open long, as event streams and long
	// polls do; each holds a worker thread all the while, so they are capped per
	// client and per listener, leaving workers for everything else.
	class LongRequestSlot
	{
	public:
		explicit LongRequestSlot(std::function<void()> release) : FRelease(std::move(release)) {}
		LongRequestSlot(LongRequestSlot &&other) noexcept : FRelease(std::exchange(other.FRelease, nullptr)) {}
		LongRequestSlot(const LongRequestSlot &) = delete;
		LongRequestSlot &operator=(const LongRequestSlot &) = delete;
		LongRequestSlot &operator=(LongRequestSlot &&) = delete;
		~LongRequestSlot()
		{
			if (FRelease)
				FRelease();
		}

	private:
		std::function<void()> FRelease;
	};

	// None when the client, or all clients of the listener together, hold too many.
	std::optional<LongRequestSlot> TakeLongRequestSlot();
}
