#include "joinPumpingMessages.h"

#ifdef _WIN32
#include <windows.h>
#endif

void JoinPumpingMessages(std::thread &thread)
{
	if (!thread.joinable())
		return;
#ifdef _WIN32
	HANDLE handle = thread.native_handle();
	bool quitSeen = false;
	WPARAM quitCode = 0;
	while (MsgWaitForMultipleObjects(1, &handle, FALSE, INFINITE, QS_ALLINPUT) == WAIT_OBJECT_0 + 1)
	{
		MSG msg;
		while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE))
		{
			if (msg.message == WM_QUIT)
			{
				quitSeen = true;
				quitCode = msg.wParam;
				continue;
			}
			TranslateMessage(&msg);
			DispatchMessage(&msg);
		}
	}
	if (quitSeen)
		PostQuitMessage(static_cast<int>(quitCode));
#endif
	thread.join();
}
