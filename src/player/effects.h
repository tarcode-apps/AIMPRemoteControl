#pragma once

#include <optional>
#include <string>
#include <vector>

class IAIMPCore;

namespace player
{
	struct EqualizerBand
	{
		double Frequency = 0; // Hz
		double Gain = 0;	  // dB, -15..15
	};

	struct EqualizerState
	{
		bool Active = false;
		bool Auto = false; // the player picks a preset by the track's genre
		double Preamp = 0; // dB, -15..15
		// The preset whose gains the bands hold right now; none for a custom curve.
		std::optional<std::string> Preset;
		std::vector<EqualizerBand> Bands;
	};

	// The ranges are the player's: the SDK header understates some of them.
	struct EffectsState
	{
		float Balance = 0;	 // -1..1
		float Speed = 1;	 // 0.5..3
		float Tempo = 1;	 // 0.5..3
		float Pitch = 0;	 // -10..10
		float Echo = 0;		 // 0..1
		float Reverb = 0;	 // 0..1
		float Flanger = 0;	 // 0..1
		float Chorus = 0;	 // 0..1
		float TrueBass = 0;	 // 0..2
		float Enhancer = 1;	 // 1..5
		EqualizerState Equalizer;
	};

	EffectsState GetEffects(IAIMPCore *core);
	int EqualizerBandCount(IAIMPCore *core);

	struct BandGain
	{
		int Index = 0;
		double Gain = 0;
	};

	struct EffectsPatch
	{
		std::optional<float> Balance;
		std::optional<float> Speed;
		std::optional<float> Tempo;
		std::optional<float> Pitch;
		std::optional<float> Echo;
		std::optional<float> Reverb;
		std::optional<float> Flanger;
		std::optional<float> Chorus;
		std::optional<float> TrueBass;
		std::optional<float> Enhancer;
		std::optional<bool> EqualizerActive;
		std::optional<bool> EqualizerAuto;
		std::optional<double> Preamp;
		std::vector<BandGain> Bands;
	};

	bool ApplyEffectsPatch(IAIMPCore *core, const EffectsPatch &patch);

	std::vector<std::string> EqualizerPresetNames(IAIMPCore *core);

	enum class PresetResult
	{
		Ok,
		NotFound,
		Exists,
		Failed
	};

	PresetResult ApplyEqualizerPreset(IAIMPCore *core, const std::string &name);
	// Keeps the current gains under the name: a new preset, or the one that has it.
	PresetResult SaveEqualizerPreset(IAIMPCore *core, const std::string &name);
	PresetResult DeleteEqualizerPreset(IAIMPCore *core, const std::string &name);
	// Refused with Exists when another preset has the new name.
	PresetResult RenameEqualizerPreset(IAIMPCore *core, const std::string &name, const std::string &newName);
}
