#include "optionsFrame.h"

#include <algorithm>

#include "aimpHelper.h"
#include "networkInterfaces.h"
#include "pluginInfo.h"
#include "remoteControlServer.h"

class OptionsFrame::ChangeEvents : public IUnknownImpl<IAIMPUIChangeEvents>
{
public:
	explicit ChangeEvents(std::function<void()> handler) : FHandler(std::move(handler)) {}

	BOOL isOurRIID(REFIID riid) override { return EqualGUID(riid, IID_IAIMPUIChangeEvents); }
	void WINAPI OnChanged(IUnknown *) override { FHandler(); }

private:
	std::function<void()> FHandler;
};

namespace
{
	constexpr int RowHeight = 24;	  // one edit line
	constexpr int RowGap = 4;		  // vertical space between rows
	constexpr int LabelWidth = 110;	  // wide enough for the Russian "Username:"
	constexpr int LabelGap = 6;		  // between a label and its edit
	constexpr int RowIndent = 8;	  // extra left inset of rows inside a group
	constexpr int GroupGap = 8;		  // vertical space between groups
	constexpr int LinkGap = 12;		  // horizontal space between the links in the about row
	constexpr int AddressGap = 6;	  // horizontal space between an interface checkbox and its address link
	constexpr int CheckRowHeight = 17;  // natural height of an autosized checkbox row
	constexpr int GroupBottomPad = 6; // space under the last row of the connection group

	constexpr const char *FormName = "AIMPRemoteControlOptionsForm";

	template <typename T>
	T *CreateControl(IAIMPCore *core, IAIMPServiceUI *svc, IAIMPUIForm *form, IAIMPUIWinControl *parent,
					 IUnknown *events, const char *name, REFIID iid)
	{
		IAIMPString *nameStr = StringToIAIMPString(core, name);
		T *control = nullptr;
		svc->CreateControl(form, parent, nameStr, events, iid, reinterpret_cast<void **>(&control));
		if (nameStr)
			nameStr->Release();
		return control;
	}

	void SetString(IAIMPCore *core, IAIMPPropertyList *target, int propId, const std::string &text)
	{
		if (IAIMPString *s = StringToIAIMPString(core, text))
		{
			target->SetValueAsObject(propId, s);
			s->Release();
		}
	}

	// AIMP reports a checked state as -1 (Delphi True), not AIMPUI_CHECKSTATE_CHECKED.
	bool IsChecked(IAIMPPropertyList *control, int propId)
	{
		INT32 state = AIMPUI_CHECKSTATE_UNCHECKED;
		if (control)
			control->GetValueAsInt32(propId, &state);
		return state != AIMPUI_CHECKSTATE_UNCHECKED;
	}

	void SetChecked(IAIMPPropertyList *control, int propId, bool checked)
	{
		if (control)
			control->SetValueAsInt32(propId, checked ? AIMPUI_CHECKSTATE_CHECKED : AIMPUI_CHECKSTATE_UNCHECKED);
	}

	void SetEnabled(const std::vector<IAIMPUIControl *> &controls, bool enabled)
	{
		for (IAIMPUIControl *c : controls)
			c->SetValueAsInt32(AIMPUI_CONTROL_PROPID_ENABLED, enabled ? 1 : 0);
	}

	void ReleaseAll(std::vector<IAIMPUIControl *> &controls)
	{
		for (IAIMPUIControl *c : controls)
			c->Release();
		controls.clear();
	}

	template <typename T>
	void Drop(T *&p)
	{
		if (p)
		{
			p->Release();
			p = nullptr;
		}
	}

	void Align(IAIMPUIControl *control, TAIMPUIControlAlignment alignment, int size = 0, RECT margins = {})
	{
		TAIMPUIControlPlacement placement = {};
		placement.Alignment = alignment;
		placement.AlignmentMargins = margins;
		placement.Bounds = {0, 0, size, size};
		control->SetPlacement(placement);
	}

	IAIMPUIGroupBox *CreateGroup(IAIMPCore *core, IAIMPServiceUI *svc, IAIMPUIForm *form, IUnknown *events,
								 const char *name, int checkMode, int topGap)
	{
		auto *group = CreateControl<IAIMPUIGroupBox>(core, svc, form, form, events, name, IID_IAIMPUIGroupBox);
		if (!group)
			return nullptr;
		group->SetValueAsInt32(AIMPUI_GROUPBOX_PROPID_CHECKMODE, checkMode);
		group->SetValueAsInt32(AIMPUI_GROUPBOX_PROPID_AUTOSIZE, 1);
		Align(group, ualTop, 0, {0, topGap, 0, 0});
		return group;
	}

	IAIMPUICheckBox *CreateCheckBox(IAIMPCore *core, IAIMPServiceUI *svc, IAIMPUIForm *form,
									IAIMPUIWinControl *parent, IUnknown *events, const char *name)
	{
		auto *check = CreateControl<IAIMPUICheckBox>(core, svc, form, parent, events, name, IID_IAIMPUICheckBox);
		if (check)
			Align(check, ualTop, RowHeight, {RowIndent, RowGap, 0, 0});
		return check;
	}

	IAIMPUIEdit *CreateLabeledEdit(IAIMPCore *core, IAIMPServiceUI *svc, IAIMPUIForm *form,
								   IAIMPUIWinControl *parent, IUnknown *events,
								   const char *baseName,
								   std::vector<IAIMPUIControl *> &children)
	{
		const std::string rowName = std::string("pn") + baseName;
		auto *row = CreateControl<IAIMPUIPanel>(core, svc, form, parent, nullptr, rowName.c_str(), IID_IAIMPUIPanel);
		if (!row)
			return nullptr;
		row->SetValueAsInt32(AIMPUI_PANEL_PROPID_TRANSPARENT, 1);
		row->SetValueAsInt32(AIMPUI_PANEL_PROPID_BORDERS, 0);
		Align(row, ualTop, RowHeight, {RowIndent, RowGap, 0, 0});

		const std::string labelName = std::string("lb") + baseName;
		if (auto *label = CreateControl<IAIMPUILabel>(core, svc, form, row, nullptr, labelName.c_str(), IID_IAIMPUILabel))
		{
			label->SetValueAsInt32(AIMPUI_LABEL_PROPID_AUTOSIZE, 0);
			label->SetValueAsInt32(AIMPUI_LABEL_PROPID_TEXTALIGN, AIMPUI_ALIGN_FAR);
			label->SetValueAsInt32(AIMPUI_LABEL_PROPID_TEXTALIGNVERT, AIMPUI_ALIGN_CENTER);
			Align(label, ualLeft, LabelWidth, {0, 0, LabelGap, 0});
			children.push_back(label);
		}

		const std::string editName = std::string("ed") + baseName;
		auto *edit = CreateControl<IAIMPUIEdit>(core, svc, form, row, events, editName.c_str(), IID_IAIMPUIEdit);
		if (edit)
		{
			Align(edit, ualClient);
			edit->AddRef();
			children.push_back(edit);
		}
		row->Release();
		return edit;
	}
}

OptionsFrame::OptionsFrame(IAIMPCore *Core, SettingsChangedHandler onSettingsChanged)
	: FCore(Core), FOnSettingsChanged(std::move(onSettingsChanged))
{
	FEvents = new ChangeEvents([this]
							   { OnControlChanged(); });
	FEvents->AddRef();
	FBrowseEvents = new ChangeEvents([this]
									 { OnBrowseUploadFolder(); });
	FBrowseEvents->AddRef();
}

BOOL OptionsFrame::isOurRIID(REFIID riid)
{
	return EqualGUID(riid, IID_IAIMPOptionsDialogFrame);
}

HRESULT WINAPI OptionsFrame::GetName(IAIMPString **S)
{
	*S = StringToIAIMPString(FCore, Localize(FCore, std::string(FormName) + "\\Caption", PLUGIN_NAME));
	return *S ? S_OK : E_FAIL;
}

HWND WINAPI OptionsFrame::CreateFrame(HWND ParentWnd)
{
	if (FForm)
		return FForm->GetHandle();

	IAIMPServiceUI *svc = nullptr;
	if (Failed(FCore->QueryInterface(IID_IAIMPServiceUI, reinterpret_cast<void **>(&svc))))
		return 0;

	IAIMPString *name = StringToIAIMPString(FCore, FormName);
	HRESULT r = svc->CreateForm(ParentWnd, AIMPUI_SERVICE_CREATEFORM_FLAGS_CHILD, name, nullptr, &FForm);
	if (name)
		name->Release();

	if (Succeeded(r) && FForm)
	{
		BuildControls(svc);
		LoadFromSettings();
	}
	svc->Release();

	return FForm ? FForm->GetHandle() : 0;
}

void OptionsFrame::BuildControls(IAIMPServiceUI *svc)
{
	BuildConnectionGroup(svc);
	BuildFeaturesGroup(svc);
	BuildAuthGroup(svc);
	BuildAboutRow(svc);
}

void OptionsFrame::BuildAboutRow(IAIMPServiceUI *svc)
{
	auto *row = CreateControl<IAIMPUIPanel>(FCore, svc, FForm, FForm, nullptr, "pnAbout", IID_IAIMPUIPanel);
	if (!row)
		return;
	row->SetValueAsInt32(AIMPUI_PANEL_PROPID_TRANSPARENT, 1);
	row->SetValueAsInt32(AIMPUI_PANEL_PROPID_BORDERS, 0);
	Align(row, ualBottom, RowHeight, {RowIndent, GroupGap, 0, 0});

	const auto addLabel = [&](const char *name, const std::string &text, const char *url)
	{
		auto *label = CreateControl<IAIMPUILabel>(FCore, svc, FForm, row, nullptr, name, IID_IAIMPUILabel);
		if (!label)
			return;
		label->SetValueAsInt32(AIMPUI_LABEL_PROPID_AUTOSIZE, 1);
		label->SetValueAsInt32(AIMPUI_LABEL_PROPID_TEXTALIGNVERT, AIMPUI_ALIGN_CENTER);
		if (!text.empty())
			SetString(FCore, label, AIMPUI_LABEL_PROPID_TEXT, text);
		if (url)
			SetString(FCore, label, AIMPUI_LABEL_PROPID_URL, url);
		Align(label, ualRight, 0, {LinkGap, 0, 0, 0});
		label->Release();
	};

	addLabel("lbLinkForum", "4PDA", PLUGIN_URL_FORUM);
	addLabel("lbLinkApp", "", PLUGIN_URL_APP);
	addLabel("lbLinkGitHub", "GitHub", PLUGIN_URL_GITHUB);
	addLabel("lbVersion", std::string(PLUGIN_NAME) + " " + PLUGIN_VERSION_STRING, nullptr);
}

void OptionsFrame::BuildConnectionGroup(IAIMPServiceUI *svc)
{
	auto *group = CreateGroup(FCore, svc, FForm, nullptr, "gbConnection", AIMPUI_CHECKMODE_NONE, 0);
	if (!group)
		return;

	if (auto *hint = CreateControl<IAIMPUILabel>(FCore, svc, FForm, group, nullptr, "lbConnectionHint", IID_IAIMPUILabel))
	{
		hint->SetValueAsInt32(AIMPUI_LABEL_PROPID_AUTOSIZE, 0);
		hint->SetValueAsInt32(AIMPUI_LABEL_PROPID_WORDWRAP, 1);
		Align(hint, ualTop, RowHeight, {RowIndent, RowGap, 0, 0});
		hint->Release();
	}

	const std::string port = std::to_string(AIMPRemoteControlServer::DefaultPort);
	IAIMPUIControl *lastRow = nullptr;
	int linkCount = 0;

	const auto addLink = [&](IAIMPUIPanel *row, const std::string &address)
	{
		const std::string name = "lbAddress" + std::to_string(linkCount++);
		auto *link = CreateControl<IAIMPUILabel>(FCore, svc, FForm, row, nullptr, name.c_str(), IID_IAIMPUILabel);
		if (!link)
			return;
		link->SetValueAsInt32(AIMPUI_LABEL_PROPID_AUTOSIZE, 1);
		link->SetValueAsInt32(AIMPUI_LABEL_PROPID_TEXTALIGNVERT, AIMPUI_ALIGN_CENTER);
		SetString(FCore, link, AIMPUI_LABEL_PROPID_TEXT, address + ":" + port);
		SetString(FCore, link, AIMPUI_LABEL_PROPID_URL, "http://" + address + ":" + port + "/");
		Align(link, ualLeft, 0, {AddressGap, -1, 0, 1});
		link->Release();
	};

	std::vector<std::pair<std::string, IAIMPUIPanel *>> rows;

	std::vector<NetworkAddress> addresses = ListIPv4Addresses();
	std::stable_partition(addresses.begin(), addresses.end(), [](const NetworkAddress &a)
						  { return a.IsLoopback; });
	for (const NetworkAddress &a : addresses)
	{
		auto known = std::find_if(rows.begin(), rows.end(),
								  [&](const auto &r)
								  { return r.first == a.InterfaceId; });
		if (known != rows.end())
		{
			addLink(known->second, a.Address);
			continue;
		}
		const std::string rowName = "pnInterface" + std::to_string(FInterfaceChecks.size());
		auto *row = CreateControl<IAIMPUIPanel>(FCore, svc, FForm, group, nullptr, rowName.c_str(), IID_IAIMPUIPanel);
		if (!row)
			continue;
		row->SetValueAsInt32(AIMPUI_PANEL_PROPID_TRANSPARENT, 1);
		row->SetValueAsInt32(AIMPUI_PANEL_PROPID_BORDERS, 0);
		Align(row, ualTop, CheckRowHeight, {RowIndent, RowGap, 0, 0});

		const std::string name = "cbInterface" + std::to_string(FInterfaceChecks.size());
		IAIMPUICheckBox *check = CreateCheckBox(FCore, svc, FForm, row, FEvents, name.c_str());
		if (!check)
		{
			row->Release();
			continue;
		}
		Align(check, ualLeft);
		const std::string label = a.IsLoopback ? "localhost" : (a.InterfaceName.empty() ? a.InterfaceId : a.InterfaceName);
		SetString(FCore, check, AIMPUI_CHECKBOX_PROPID_CAPTION, label + ":");
		FInterfaceChecks.push_back({a.InterfaceId, check});
		addLink(row, a.Address);
		rows.push_back({a.InterfaceId, row});
		lastRow = row;
		row->Release();
	}

	if (lastRow)
		Align(lastRow, ualTop, CheckRowHeight, {RowIndent, RowGap, 0, GroupBottomPad});
	group->Release();
}

void OptionsFrame::BuildAuthGroup(IAIMPServiceUI *svc)
{
	FAuthGroup = CreateGroup(FCore, svc, FForm, FEvents, "gbAuth", AIMPUI_CHECKMODE_TOGGLE_ENABLED, GroupGap);
	if (!FAuthGroup)
		return;

	FUserEdit = CreateLabeledEdit(FCore, svc, FForm, FAuthGroup, FEvents, "User", FAuthChildren);
	FPassEdit = CreateLabeledEdit(FCore, svc, FForm, FAuthGroup, FEvents, "Pass", FAuthChildren);
	if (FPassEdit)
		FPassEdit->SetValueAsInt32(AIMPUI_EDIT_PROPID_PASSWORDCHAR, static_cast<INT32>('*'));

	if (auto *hint = CreateControl<IAIMPUILabel>(FCore, svc, FForm, FAuthGroup, nullptr, "lbPassHint", IID_IAIMPUILabel))
	{
		hint->SetValueAsInt32(AIMPUI_LABEL_PROPID_AUTOSIZE, 0);
		hint->SetValueAsInt32(AIMPUI_LABEL_PROPID_WORDWRAP, 1);
		Align(hint, ualTop, RowHeight, {RowIndent + LabelWidth + LabelGap, 0, 0, 0}); // no top gap: it belongs to the password row
		FAuthChildren.push_back(hint);
	}
}

void OptionsFrame::BuildFeaturesGroup(IAIMPServiceUI *svc)
{
	auto *group = CreateGroup(FCore, svc, FForm, nullptr, "gbFeatures", AIMPUI_CHECKMODE_NONE, GroupGap);
	if (!group)
		return;

	FSchedulerCheck = CreateCheckBox(FCore, svc, FForm, group, FEvents, "cbScheduler");
	FPhysicalDeletionCheck = CreateCheckBox(FCore, svc, FForm, group, FEvents, "cbPhysicalDeletion");
	FBrowseFilesCheck = CreateCheckBox(FCore, svc, FForm, group, FEvents, "cbBrowseFiles");
	FUploadTracksCheck = CreateCheckBox(FCore, svc, FForm, group, FEvents, "cbUploadTracks");

	FUploadFolderEdit = CreateLabeledEdit(FCore, svc, FForm, group, FEvents, "UploadFolder", FUploadFolderChildren);
	if (FUploadFolderEdit)
	{
		IAIMPUIEditButton *button = nullptr;
		if (Succeeded(FUploadFolderEdit->AddButton(FBrowseEvents, &button)) && button)
			button->Release();
	}

	group->Release();
}

void OptionsFrame::UpdateEnabledStates()
{
	SetEnabled(FAuthChildren, IsChecked(FAuthGroup, AIMPUI_GROUPBOX_PROPID_CHECKED));
	SetEnabled(FUploadFolderChildren, IsChecked(FUploadTracksCheck, AIMPUI_CHECKBOX_PROPID_STATE));
}

void OptionsFrame::LoadFromSettings()
{
	FSettings = Settings::Load(FCore);
	const Settings::AuthSettings &a = FSettings.Auth;
	const Settings::FeatureSettings &f = FSettings.Features;

	FLoading = true;
	SetChecked(FAuthGroup, AIMPUI_GROUPBOX_PROPID_CHECKED, a.Enabled);
	if (FUserEdit)
		SetString(FCore, FUserEdit, AIMPUI_BASEEDIT_PROPID_TEXT, a.Username);
	if (FPassEdit)
		SetString(FCore, FPassEdit, AIMPUI_BASEEDIT_PROPID_TEXT, "");

	SetChecked(FPhysicalDeletionCheck, AIMPUI_CHECKBOX_PROPID_STATE, f.PhysicalDeletion);
	SetChecked(FBrowseFilesCheck, AIMPUI_CHECKBOX_PROPID_STATE, f.BrowseFiles);
	SetChecked(FUploadTracksCheck, AIMPUI_CHECKBOX_PROPID_STATE, f.UploadTracks);
	if (FUploadFolderEdit)
		SetString(FCore, FUploadFolderEdit, AIMPUI_BASEEDIT_PROPID_TEXT, f.EffectiveUploadFolder());
	SetChecked(FSchedulerCheck, AIMPUI_CHECKBOX_PROPID_STATE, f.Scheduler);

	const std::vector<std::string> &excluded = FSettings.Network.ExcludedInterfaces;
	for (const InterfaceCheck &c : FInterfaceChecks)
		SetChecked(c.Check, AIMPUI_CHECKBOX_PROPID_STATE,
				   std::find(excluded.begin(), excluded.end(), c.Id) == excluded.end());
	FLoading = false;

	UpdateEnabledStates();
}

void OptionsFrame::SaveToSettings()
{
	if (!FForm)
		return;

	Settings s = FSettings;

	Settings::AuthSettings &a = s.Auth;
	a.Enabled = IsChecked(FAuthGroup, AIMPUI_GROUPBOX_PROPID_CHECKED);
	if (FUserEdit)
		a.Username = GetPropertyAsString(FUserEdit, AIMPUI_BASEEDIT_PROPID_TEXT);
	const std::string password = FPassEdit ? GetPropertyAsString(FPassEdit, AIMPUI_BASEEDIT_PROPID_TEXT) : std::string();
	if (!password.empty())
		a.Ha1 = Settings::AuthSettings::ComputeHa1(a.Username, password);
	else if (a.Username != FSettings.Auth.Username)
		a.Ha1.clear();

	Settings::FeatureSettings &f = s.Features;
	f.PhysicalDeletion = IsChecked(FPhysicalDeletionCheck, AIMPUI_CHECKBOX_PROPID_STATE);
	f.BrowseFiles = IsChecked(FBrowseFilesCheck, AIMPUI_CHECKBOX_PROPID_STATE);
	f.UploadTracks = IsChecked(FUploadTracksCheck, AIMPUI_CHECKBOX_PROPID_STATE);
	if (FUploadFolderEdit)
		f.UploadFolder = Settings::FeatureSettings::UploadFolderForStorage(
			GetPropertyAsString(FUploadFolderEdit, AIMPUI_BASEEDIT_PROPID_TEXT));
	f.Scheduler = IsChecked(FSchedulerCheck, AIMPUI_CHECKBOX_PROPID_STATE);

	std::vector<std::string> &excluded = s.Network.ExcludedInterfaces;
	for (const InterfaceCheck &c : FInterfaceChecks)
	{
		const bool exclude = !IsChecked(c.Check, AIMPUI_CHECKBOX_PROPID_STATE);
		const auto it = std::find(excluded.begin(), excluded.end(), c.Id);
		if (exclude && it == excluded.end())
			excluded.push_back(c.Id);
		else if (!exclude && it != excluded.end())
			excluded.erase(it);
	}

	s.Save(FCore);
	FSettings = s;
	if (FPassEdit)
		SetString(FCore, FPassEdit, AIMPUI_BASEEDIT_PROPID_TEXT, "");

	if (FOnSettingsChanged)
		FOnSettingsChanged(FSettings);
}

void OptionsFrame::OnControlChanged()
{
	if (FLoading)
		return;

	UpdateEnabledStates();

	IAIMPServiceOptionsDialog *dlg = nullptr;
	if (Succeeded(FCore->QueryInterface(IID_IAIMPServiceOptionsDialog, reinterpret_cast<void **>(&dlg))))
	{
		dlg->FrameModified(this);
		dlg->Release();
	}
}

void OptionsFrame::OnBrowseUploadFolder()
{
	if (!FForm || !FUploadFolderEdit)
		return;

	IAIMPServiceUI *svc = nullptr;
	if (Failed(FCore->QueryInterface(IID_IAIMPServiceUI, reinterpret_cast<void **>(&svc))))
		return;

	IAIMPUIBrowseFolderDialog *dialog = nullptr;
	if (Succeeded(svc->QueryInterface(IID_IAIMPUIBrowseFolderDialog, reinterpret_cast<void **>(&dialog))) && dialog)
	{
		IAIMPString *current = StringToIAIMPString(FCore, GetPropertyAsString(FUploadFolderEdit, AIMPUI_BASEEDIT_PROPID_TEXT));
		IAIMPObjectList *selection = nullptr;
		if (Succeeded(dialog->Execute(FForm->GetHandle(), AIMPUI_FLAGS_BROWSEFOLDER_CUSTOMPATHS, current, &selection)) &&
			selection)
		{
			IAIMPString *folder = nullptr;
			if (selection->GetCount() > 0 &&
				Succeeded(selection->GetObject(0, IID_IAIMPString, reinterpret_cast<void **>(&folder))) && folder)
			{
				FUploadFolderEdit->SetValueAsObject(AIMPUI_BASEEDIT_PROPID_TEXT, folder);
				folder->Release();
			}
			selection->Release();
		}
		if (current)
			current->Release();
		dialog->Release();
	}
	svc->Release();
}

void WINAPI OptionsFrame::DestroyFrame()
{
	ReleaseAll(FAuthChildren);
	ReleaseAll(FUploadFolderChildren);
	for (InterfaceCheck &c : FInterfaceChecks)
		c.Check->Release();
	FInterfaceChecks.clear();
	Drop(FPassEdit);
	Drop(FUserEdit);
	Drop(FAuthGroup);
	Drop(FPhysicalDeletionCheck);
	Drop(FBrowseFilesCheck);
	Drop(FUploadTracksCheck);
	Drop(FUploadFolderEdit);
	Drop(FSchedulerCheck);
	if (FForm)
	{
		FForm->Destroy(false);
		FForm = nullptr;
	}
}

void WINAPI OptionsFrame::Notification(INT32 ID)
{
	switch (ID)
	{
	case AIMP_SERVICE_OPTIONSDIALOG_NOTIFICATION_LOAD:
		LoadFromSettings();
		break;
	case AIMP_SERVICE_OPTIONSDIALOG_NOTIFICATION_SAVE:
		SaveToSettings();
		break;
	default:
		break;
	}
}
