#pragma once

#include <functional>
#include <mutex>
#include <set>
#include <string>
#include <utility>

// What became of the server's listeners at its last look at the network: the addresses
// it cannot listen on, their port being taken. Written on the server's thread, read by
// the options page.
class ListenerStatus
{
public:
	std::set<std::string> TakenAddresses() const
	{
		std::lock_guard lock(FMutex);
		return FTakenAddresses;
	}

	// Tells the listener of a change, on the calling thread.
	void SetTakenAddresses(const std::set<std::string> &addresses)
	{
		std::function<void()> changed;
		{
			std::lock_guard lock(FMutex);
			if (FTakenAddresses == addresses)
				return;
			FTakenAddresses = addresses;
			changed = FChanged;
		}
		if (changed)
			changed();
	}

	void OnChange(std::function<void()> listener)
	{
		std::lock_guard lock(FMutex);
		FChanged = std::move(listener);
	}

private:
	mutable std::mutex FMutex;
	std::set<std::string> FTakenAddresses;
	std::function<void()> FChanged;
};
