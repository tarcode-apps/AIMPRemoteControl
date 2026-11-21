#pragma once

#include <functional>
#include <string>
#include <vector>

#include "apiCore.h"
#include "apiOptions.h"
#include "apiGUI.h"
#include "IUnknownImpl.h"

#include "settings.h"

class ListenerStatus;

namespace player
{
	struct PlayerFeatures;
}

class OptionsFrame : public IUnknownImpl<IAIMPOptionsDialogFrame>
{
public:
	using SettingsChangedHandler = std::function<void(const Settings &)>;

	OptionsFrame(IAIMPCore *Core, const player::PlayerFeatures &features, const ListenerStatus &listenerStatus,
				 SettingsChangedHandler onSettingsChanged);

	// Marks the addresses whose port is taken; the server's look at the network after
	// the settings are applied brings it too.
	void ShowTakenAddresses();

	BOOL isOurRIID(REFIID riid) override;

	HRESULT WINAPI GetName(IAIMPString **S) override;
	HWND WINAPI CreateFrame(HWND ParentWnd) override;
	void WINAPI DestroyFrame() override;
	void WINAPI Notification(INT32 ID) override;

private:
	class ChangeEvents;

	void BuildControls(IAIMPServiceUI *svc);
	void BuildConnectionGroup(IAIMPServiceUI *svc);
	void BuildAuthGroup(IAIMPServiceUI *svc);
	void BuildAboutRow(IAIMPServiceUI *svc);
	void BuildFeaturesGroup(IAIMPServiceUI *svc);
	void LoadFromSettings();
	void SaveToSettings();
	void OnControlChanged();
	void OnBrowseUploadFolder();
	void UpdateEnabledStates();
	bool HasPassword() const;

	IAIMPCore *FCore;
	const player::PlayerFeatures &FFeatures;
	const ListenerStatus &FListenerStatus;
	SettingsChangedHandler FOnSettingsChanged;
	ChangeEvents *FEvents = nullptr;
	ChangeEvents *FBrowseEvents = nullptr;

	IAIMPUIForm *FForm = nullptr;

	// Connection group
	IAIMPUIEdit *FPlayerNameEdit = nullptr;
	std::vector<IAIMPUIControl *> FConnectionChildren;
	struct InterfaceCheck
	{
		std::string Id;
		IAIMPUICheckBox *Check;
	};
	std::vector<InterfaceCheck> FInterfaceChecks;
	// One of the two shows: the link, or the note that the port is taken.
	struct AddressLabels
	{
		std::string Address;
		IAIMPUIControl *Link;
		IAIMPUIControl *Taken;
	};
	std::vector<AddressLabels> FAddressLabels;

	// Authentication group
	IAIMPUIGroupBox *FAuthGroup = nullptr;
	IAIMPUIEdit *FUserEdit = nullptr;
	IAIMPUIEdit *FPassEdit = nullptr;
	// Held by FAuthChildren; one of the two shows under the password.
	IAIMPUIControl *FPassHint = nullptr;
	IAIMPUIControl *FPassNeeded = nullptr;
	std::vector<IAIMPUIControl *> FAuthChildren;

	// Features group
	IAIMPUICheckBox *FPhysicalDeletionCheck = nullptr;
	IAIMPUICheckBox *FDownloadTracksCheck = nullptr;
	IAIMPUICheckBox *FUploadTracksCheck = nullptr;
	IAIMPUIEdit *FUploadFolderEdit = nullptr;
	IAIMPUICheckBox *FBrowseFilesCheck = nullptr;
	std::vector<IAIMPUIControl *> FUploadChildren;
	IAIMPUICheckBox *FSchedulerCheck = nullptr;

	Settings FSettings;
	bool FLoading = false;
};
