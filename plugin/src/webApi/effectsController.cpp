#include "effectsController.h"

#include "apiErrors.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <optional>
#include <string>

#include "helpers/requestHelpers.h"
#include "mainThreadRunner.h"
#include "player/effects.h"
#include "stateUpdateEvents.h"

namespace
{
	using webapi::OptionalField;

	constexpr double GainRangeDb = 15.0;
	constexpr std::size_t MaxPresetNameLength = 100;

	std::size_t CharacterCount(const std::string &utf8)
	{
		return static_cast<std::size_t>(std::count_if(utf8.begin(), utf8.end(), [](char c)
													  { return (static_cast<unsigned char>(c) & 0xC0) != 0x80; }));
	}

	double Rounded(double value)
	{
		return std::round(value * 1000.0) / 1000.0;
	}

	// A number field within the player's range for it.
	std::optional<float> RangeField(const nlohmann::json &body, const char *name, double min, double max)
	{
		const std::optional<double> value = OptionalField<double>(body, name, &nlohmann::json::is_number);
		if (value && (*value < min || *value > max))
			throw ApiError(400, "invalidBody");
		return value ? std::optional<float>(static_cast<float>(*value)) : std::nullopt;
	}

	player::EffectsPatch PatchBody(const nlohmann::json &body)
	{
		if (!body.is_object() || body.empty())
			throw ApiError(400, "invalidBody");
		player::EffectsPatch patch;
		patch.Balance = RangeField(body, "balance", -1, 1);
		patch.Speed = RangeField(body, "speed", 0.5, 3);
		patch.Tempo = RangeField(body, "tempo", 0.5, 3);
		patch.Pitch = RangeField(body, "pitch", -10, 10);
		patch.Echo = RangeField(body, "echo", 0, 1);
		patch.Reverb = RangeField(body, "reverb", 0, 1);
		patch.Flanger = RangeField(body, "flanger", 0, 1);
		patch.Chorus = RangeField(body, "chorus", 0, 1);
		patch.TrueBass = RangeField(body, "trueBass", 0, 2);
		patch.Enhancer = RangeField(body, "enhancer", 1, 5);
		if (!body.contains("equalizer"))
			return patch;

		const nlohmann::json &equalizer = body["equalizer"];
		if (!equalizer.is_object())
			throw ApiError(400, "invalidBody");
		patch.EqualizerActive = OptionalField<bool>(equalizer, "active", &nlohmann::json::is_boolean);
		patch.EqualizerAuto = OptionalField<bool>(equalizer, "auto", &nlohmann::json::is_boolean);
		patch.Preamp = OptionalField<double>(equalizer, "preamp", &nlohmann::json::is_number);
		if (patch.Preamp && std::fabs(*patch.Preamp) > GainRangeDb)
			throw ApiError(400, "invalidBody");
		if (!equalizer.contains("bands"))
			return patch;
		if (!equalizer["bands"].is_array())
			throw ApiError(400, "invalidBody");
		for (const nlohmann::json &band : equalizer["bands"])
		{
			if (!band.is_object() || !band.contains("index") || !band["index"].is_number_integer() || !band.contains("gain") ||
				!band["gain"].is_number())
				throw ApiError(400, "invalidBody");
			const player::BandGain gain{band["index"].get<int>(), band["gain"].get<double>()};
			if (gain.Index < 0 || std::fabs(gain.Gain) > GainRangeDb)
				throw ApiError(400, "invalidBody");
			patch.Bands.push_back(gain);
		}
		return patch;
	}

	// The name of a preset, trimmed; refused when nothing is left of it.
	std::string PresetNameBody(const nlohmann::json &body, const char *field = "name")
	{
		if (!body.is_object())
			throw ApiError(400, "invalidBody");
		std::optional<std::string> name = OptionalField<std::string>(body, field, &nlohmann::json::is_string);
		if (!name)
			throw ApiError(400, "invalidBody");
		const auto notSpace = [](unsigned char c) { return !std::isspace(c); };
		name->erase(name->begin(), std::find_if(name->begin(), name->end(), notSpace));
		name->erase(std::find_if(name->rbegin(), name->rend(), notSpace).base(), name->end());
		if (name->empty() || CharacterCount(*name) > MaxPresetNameLength)
			throw ApiError(400, "invalidBody");
		return *name;
	}

	void ThrowUnlessPresetOk(player::PresetResult result)
	{
		switch (result)
		{
		case player::PresetResult::Ok:
			return;
		case player::PresetResult::NotFound:
			throw ApiError(404, "presetNotFound");
		case player::PresetResult::Exists:
			throw ApiError(409, "presetExists");
		case player::PresetResult::Failed:
			throw ApiError(500, "playerCommandFailed");
		}
	}
}

nlohmann::json webapi::EffectsController::ToJson(IAIMPCore *core, StateUpdateEvents &events)
{
	// Read before the state, so that the state is at least as new as the revision.
	const std::uint64_t revision = events.Current()[StateUpdateEvents::Effects];
	const player::EffectsState state = RunOnMainThread(core, [&]
													   { return player::GetEffects(core); });
	nlohmann::json bands = nlohmann::json::array();
	for (const player::EqualizerBand &band : state.Equalizer.Bands)
		bands.push_back({{"frequency", band.Frequency}, {"gain", Rounded(band.Gain)}});
	return {
		{"revision", revision},
		{"balance", Rounded(state.Balance)},
		{"speed", Rounded(state.Speed)},
		{"tempo", Rounded(state.Tempo)},
		{"pitch", Rounded(state.Pitch)},
		{"echo", Rounded(state.Echo)},
		{"reverb", Rounded(state.Reverb)},
		{"flanger", Rounded(state.Flanger)},
		{"chorus", Rounded(state.Chorus)},
		{"trueBass", Rounded(state.TrueBass)},
		{"enhancer", Rounded(state.Enhancer)},
		{"equalizer", {
			{"active", state.Equalizer.Active},
			{"auto", state.Equalizer.Auto},
			{"preamp", Rounded(state.Equalizer.Preamp)},
			{"preset", state.Equalizer.Preset ? nlohmann::json(*state.Equalizer.Preset) : nlohmann::json(nullptr)},
			{"bands", std::move(bands)},
		}},
	};
}

void webapi::EffectsController::Register(IEndpointRouteBuilder &endpoints)
{
	endpoints.MapApi(HttpMethod::Get, "/api/v1/effects", [core = FCore, &events = FEvents](const ApiRequest &) -> nlohmann::json
			   { return ToJson(core, events); });

	endpoints.MapApi(HttpMethod::Patch, "/api/v1/effects", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const player::EffectsPatch patch = PatchBody(request.Body);
		bool badBand = false;
		const bool ok = RunOnMainThread(core, [&]
										{
			const int count = player::EqualizerBandCount(core);
			badBand = std::any_of(patch.Bands.begin(), patch.Bands.end(), [&](const player::BandGain &band)
								  { return band.Index >= count; });
			return !badBand && player::ApplyEffectsPatch(core, patch); });
		if (badBand)
			throw ApiError(400, "invalidBody");
		if (!ok)
			throw ApiError(500, "playerCommandFailed");
		// The player reports the change on its own a moment later; counted now, an
		// event built before it cannot pass for the state after it.
		events.Notify(StateUpdateEvents::Effects);
		return ToJson(core, events); });

	endpoints.MapApi(HttpMethod::Get, "/api/v1/effects/presets", [core = FCore](const ApiRequest &) -> nlohmann::json
			   {
		nlohmann::json presets = nlohmann::json::array();
		for (const std::string &name : RunOnMainThread(core, [&]
													   { return player::EqualizerPresetNames(core); }))
			presets.push_back({{"name", name}});
		return presets; });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/effects/presets", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string name = PresetNameBody(request.Body);
		ThrowUnlessPresetOk(RunOnMainThread(core, [&]
									  { return player::SaveEqualizerPreset(core, name); }));
		events.Notify(StateUpdateEvents::Effects);
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/effects/presets/apply", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string name = PresetNameBody(request.Body);
		ThrowUnlessPresetOk(RunOnMainThread(core, [&]
									  { return player::ApplyEqualizerPreset(core, name); }));
		events.Notify(StateUpdateEvents::Effects);
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/effects/presets/remove", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string name = PresetNameBody(request.Body);
		ThrowUnlessPresetOk(RunOnMainThread(core, [&]
									  { return player::DeleteEqualizerPreset(core, name); }));
		events.Notify(StateUpdateEvents::Effects);
		return nlohmann::json::object(); });

	endpoints.MapApi(HttpMethod::Post, "/api/v1/effects/presets/rename", [core = FCore, &events = FEvents](const ApiRequest &request) -> nlohmann::json
			   {
		const std::string name = PresetNameBody(request.Body);
		const std::string newName = PresetNameBody(request.Body, "newName");
		ThrowUnlessPresetOk(RunOnMainThread(core, [&]
									  { return player::RenameEqualizerPreset(core, name, newName); }));
		events.Notify(StateUpdateEvents::Effects);
		return nlohmann::json::object(); });
}
