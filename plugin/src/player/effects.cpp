#include "effects.h"

#include <cmath>
#include <utility>

#include "apiCore.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "aimpHelper.h"

namespace
{
	using player::PresetResult;

	// Preset gains are stored as doubles, the equalizer holds floats.
	constexpr double GainTolerance = 0.005;

	class Dispatcher
	{
	public:
		explicit Dispatcher(IAIMPCore *core) : FService(AcquireService<IAIMPServiceMessageDispatcher>(core, IID_IAIMPServiceMessageDispatcher)) {}
		~Dispatcher()
		{
			if (FService)
				FService->Release();
		}
		Dispatcher(const Dispatcher &) = delete;
		Dispatcher &operator=(const Dispatcher &) = delete;

		explicit operator bool() const { return FService != nullptr; }

		template <typename T>
		T Get(int property, T fallback) const
		{
			T value = fallback;
			if (!FService || Failed(FService->Send(property, AIMP_MSG_PROPVALUE_GET, &value)))
				return fallback;
			return value;
		}

		template <typename T>
		bool Set(int property, T value) const
		{
			return FService && Succeeded(FService->Send(property, AIMP_MSG_PROPVALUE_SET, &value));
		}

		template <typename T>
		bool Set(int property, const std::optional<T> &value) const
		{
			return !value || Set(property, *value);
		}

	private:
		IAIMPServiceMessageDispatcher *FService;
	};

	IAIMPServicePlayerEqualizer *Equalizer(IAIMPCore *core)
	{
		return AcquireService<IAIMPServicePlayerEqualizer>(core, IID_IAIMPServicePlayerEqualizer);
	}

	IAIMPServicePlayerEqualizerPresets *Presets(IAIMPCore *core)
	{
		return AcquireService<IAIMPServicePlayerEqualizerPresets>(core, IID_IAIMPServicePlayerEqualizerPresets);
	}

	std::vector<double> Gains(IAIMPEqualizerBands *bands)
	{
		std::vector<double> gains(static_cast<std::size_t>(bands->GetBandCount()));
		for (std::size_t i = 0; i < gains.size(); ++i)
			bands->GetBandGain(static_cast<INT32>(i), &gains[i]);
		return gains;
	}

	bool SameGains(const std::vector<double> &a, const std::vector<double> &b)
	{
		if (a.size() != b.size())
			return false;
		for (std::size_t i = 0; i < a.size(); ++i)
			if (std::fabs(a[i] - b[i]) > GainTolerance)
				return false;
		return true;
	}

	std::string PresetName(IAIMPEqualizerPreset *preset)
	{
		IAIMPString *name = nullptr;
		if (Failed(preset->GetName(&name)) || !name)
			return std::string();
		const std::string result = IAIMPStringToString(name);
		name->Release();
		return result;
	}

	// Released by the caller; null when the library has no preset of the name.
	IAIMPEqualizerPreset *FindPreset(IAIMPCore *core, IAIMPServicePlayerEqualizerPresets *presets, const std::string &name)
	{
		IAIMPString *s = StringToIAIMPString(core, name);
		if (!s)
			return nullptr;
		IAIMPEqualizerPreset *preset = nullptr;
		if (Failed(presets->FindByName(s, IID_IAIMPEqualizerPreset, reinterpret_cast<void **>(&preset))))
			preset = nullptr;
		s->Release();
		return preset;
	}

	// The player does not tell which preset it applied last, so the preset is the
	// one whose gains the equalizer holds.
	std::optional<std::string> MatchingPreset(IAIMPCore *core, const std::vector<double> &gains)
	{
		IAIMPServicePlayerEqualizerPresets *presets = Presets(core);
		if (!presets)
			return std::nullopt;
		std::optional<std::string> match;
		const INT32 count = presets->GetPresetCount();
		for (INT32 i = 0; i < count && !match; ++i)
		{
			IAIMPEqualizerPreset *preset = nullptr;
			if (Failed(presets->GetPreset(i, IID_IAIMPEqualizerPreset, reinterpret_cast<void **>(&preset))) || !preset)
				continue;
			if (SameGains(gains, Gains(preset)))
				match = PresetName(preset);
			preset->Release();
		}
		presets->Release();
		return match;
	}

	template <typename Fn>
	PresetResult WithPreset(IAIMPCore *core, const std::string &name, Fn &&fn)
	{
		IAIMPServicePlayerEqualizerPresets *presets = Presets(core);
		if (!presets)
			return PresetResult::Failed;
		IAIMPEqualizerPreset *preset = FindPreset(core, presets, name);
		PresetResult result = PresetResult::NotFound;
		if (preset)
		{
			result = fn(presets, preset) ? PresetResult::Ok : PresetResult::Failed;
			preset->Release();
		}
		presets->Release();
		return result;
	}
}

player::EffectsState player::GetEffects(IAIMPCore *core)
{
	EffectsState state;
	const Dispatcher dispatcher(core);
	state.Balance = dispatcher.Get(AIMP_MSG_PROPERTY_BALANCE, state.Balance);
	state.Speed = dispatcher.Get(AIMP_MSG_PROPERTY_SPEED, state.Speed);
	state.Tempo = dispatcher.Get(AIMP_MSG_PROPERTY_TEMPO, state.Tempo);
	state.Pitch = dispatcher.Get(AIMP_MSG_PROPERTY_PITCH, state.Pitch);
	state.Echo = dispatcher.Get(AIMP_MSG_PROPERTY_ECHO, state.Echo);
	state.Reverb = dispatcher.Get(AIMP_MSG_PROPERTY_REVERB, state.Reverb);
	state.Flanger = dispatcher.Get(AIMP_MSG_PROPERTY_FLANGER, state.Flanger);
	state.Chorus = dispatcher.Get(AIMP_MSG_PROPERTY_CHORUS, state.Chorus);
	state.TrueBass = dispatcher.Get(AIMP_MSG_PROPERTY_TRUEBASS, state.TrueBass);
	state.Enhancer = dispatcher.Get(AIMP_MSG_PROPERTY_ENHANCER, state.Enhancer);
	state.Equalizer.Auto = dispatcher.Get<BOOL>(AIMP_MSG_PROPERTY_EQUALIZER_AUTO, 0) != 0;

	if (IAIMPServicePlayerEqualizer *equalizer = Equalizer(core))
	{
		state.Equalizer.Active = equalizer->GetActive() != 0;
		equalizer->GetPreamp(&state.Equalizer.Preamp);
		const std::vector<double> gains = Gains(equalizer);
		state.Equalizer.Bands.resize(gains.size());
		for (std::size_t i = 0; i < gains.size(); ++i)
		{
			equalizer->GetBandFrequency(static_cast<INT32>(i), &state.Equalizer.Bands[i].Frequency);
			state.Equalizer.Bands[i].Gain = gains[i];
		}
		state.Equalizer.Preset = MatchingPreset(core, gains);
		equalizer->Release();
	}
	return state;
}

int player::EqualizerBandCount(IAIMPCore *core)
{
	IAIMPServicePlayerEqualizer *equalizer = Equalizer(core);
	if (!equalizer)
		return 0;
	const int count = equalizer->GetBandCount();
	equalizer->Release();
	return count;
}

bool player::ApplyEffectsPatch(IAIMPCore *core, const EffectsPatch &patch)
{
	const Dispatcher dispatcher(core);
	if (!dispatcher)
		return false;
	bool ok = true;
	for (const auto &[property, value] : {std::pair{AIMP_MSG_PROPERTY_BALANCE, patch.Balance}, std::pair{AIMP_MSG_PROPERTY_SPEED, patch.Speed},
										  std::pair{AIMP_MSG_PROPERTY_TEMPO, patch.Tempo}, std::pair{AIMP_MSG_PROPERTY_PITCH, patch.Pitch},
										  std::pair{AIMP_MSG_PROPERTY_ECHO, patch.Echo}, std::pair{AIMP_MSG_PROPERTY_REVERB, patch.Reverb},
										  std::pair{AIMP_MSG_PROPERTY_FLANGER, patch.Flanger}, std::pair{AIMP_MSG_PROPERTY_CHORUS, patch.Chorus},
										  std::pair{AIMP_MSG_PROPERTY_TRUEBASS, patch.TrueBass}, std::pair{AIMP_MSG_PROPERTY_ENHANCER, patch.Enhancer}})
		ok = dispatcher.Set(property, value) && ok;
	if (patch.EqualizerAuto)
		ok = dispatcher.Set<BOOL>(AIMP_MSG_PROPERTY_EQUALIZER_AUTO, *patch.EqualizerAuto ? 1 : 0) && ok;

	if (!patch.EqualizerActive && !patch.Preamp && patch.Bands.empty())
		return ok;
	IAIMPServicePlayerEqualizer *equalizer = Equalizer(core);
	if (!equalizer)
		return false;
	if (patch.EqualizerActive)
		ok = Succeeded(equalizer->SetActive(*patch.EqualizerActive ? 1 : 0)) && ok;
	if (patch.Preamp)
		ok = Succeeded(equalizer->SetPreamp(*patch.Preamp)) && ok;
	for (const BandGain &band : patch.Bands)
		ok = Succeeded(equalizer->SetBandGain(band.Index, band.Gain)) && ok;
	equalizer->Release();
	return ok;
}

std::vector<std::string> player::EqualizerPresetNames(IAIMPCore *core)
{
	std::vector<std::string> names;
	IAIMPServicePlayerEqualizerPresets *presets = Presets(core);
	if (!presets)
		return names;
	const INT32 count = presets->GetPresetCount();
	for (INT32 i = 0; i < count; ++i)
	{
		IAIMPEqualizerPreset *preset = nullptr;
		if (Failed(presets->GetPreset(i, IID_IAIMPEqualizerPreset, reinterpret_cast<void **>(&preset))) || !preset)
			continue;
		names.push_back(PresetName(preset));
		preset->Release();
	}
	presets->Release();
	return names;
}

player::PresetResult player::ApplyEqualizerPreset(IAIMPCore *core, const std::string &name)
{
	return WithPreset(core, name, [&](IAIMPServicePlayerEqualizerPresets *, IAIMPEqualizerPreset *preset)
					  {
		IAIMPServicePlayerEqualizer *equalizer = Equalizer(core);
		if (!equalizer)
			return false;
		const bool ok = Succeeded(equalizer->SetPreset(preset));
		equalizer->Release();
		return ok; });
}

player::PresetResult player::SaveEqualizerPreset(IAIMPCore *core, const std::string &name)
{
	IAIMPServicePlayerEqualizer *equalizer = Equalizer(core);
	if (!equalizer)
		return PresetResult::Failed;
	const std::vector<double> gains = Gains(equalizer);
	equalizer->Release();

	const PresetResult replaced = WithPreset(core, name, [&](IAIMPServicePlayerEqualizerPresets *, IAIMPEqualizerPreset *preset)
											 {
		bool ok = true;
		for (std::size_t i = 0; i < gains.size(); ++i)
			ok = Succeeded(preset->SetBandGain(static_cast<INT32>(i), gains[i])) && ok;
		return ok; });
	if (replaced != PresetResult::NotFound)
		return replaced;

	// A new preset takes the current gains as it is added.
	IAIMPServicePlayerEqualizerPresets *presets = Presets(core);
	if (!presets)
		return PresetResult::Failed;
	PresetResult result = PresetResult::Failed;
	if (IAIMPString *s = StringToIAIMPString(core, name))
	{
		IAIMPEqualizerPreset *preset = nullptr;
		if (Succeeded(presets->Add(s, IID_IAIMPEqualizerPreset, reinterpret_cast<void **>(&preset))) && preset)
		{
			result = PresetResult::Ok;
			preset->Release();
		}
		s->Release();
	}
	presets->Release();
	return result;
}

player::PresetResult player::DeleteEqualizerPreset(IAIMPCore *core, const std::string &name)
{
	return WithPreset(core, name, [](IAIMPServicePlayerEqualizerPresets *presets, IAIMPEqualizerPreset *preset)
					  { return Succeeded(presets->Delete(preset)); });
}

player::PresetResult player::RenameEqualizerPreset(IAIMPCore *core, const std::string &name, const std::string &newName)
{
	if (newName != name)
	{
		const PresetResult taken = WithPreset(core, newName, [](IAIMPServicePlayerEqualizerPresets *, IAIMPEqualizerPreset *)
											  { return true; });
		if (taken == PresetResult::Ok)
			return PresetResult::Exists;
		if (taken == PresetResult::Failed)
			return taken;
	}
	return WithPreset(core, name, [&](IAIMPServicePlayerEqualizerPresets *, IAIMPEqualizerPreset *preset)
					  {
		IAIMPString *s = StringToIAIMPString(core, newName);
		if (!s)
			return false;
		const bool ok = Succeeded(preset->SetName(s));
		s->Release();
		return ok; });
}
