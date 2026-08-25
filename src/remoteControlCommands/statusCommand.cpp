#include "statusCommand.h"

#include <cmath>
#include <optional>

#include "apiCore.h"
#include "apiFileManager.h"
#include "apiMessages.h"
#include "apiPlayer.h"
#include "equalizerBands.h"
#include "mainThreadRunner.h"

namespace
{
	// Legacy AIMP_STS_* identifiers (AIMP 2/3 SDK) used by the client.
	enum StatusId : int
	{
		StsVolume = 1,											 // 0..100
		StsBalance = 2,											 // 0..100, 50 = center
		StsSpeed = 3,											 // 0..100 over [0.5 .. 1.5]
		StsPlayer = 4,											 // AIMP_PLAYER_STATE_XXX
		StsMute = 5,											 // 0/1
		StsReverb = 6,											 // 0..100
		StsEcho = 7,											 // 0..100
		StsChorus = 8,											 // 0..100
		StsFlanger = 9,											 // 0..100
		StsEqEnabled = 10,										 // 0/1
		StsEqBandFirst = 11,									 // 18 bands, 0..100 over [-15 .. +15] dB, 50 = 0 dB
		StsEqBandLast = StsEqBandFirst + EqualizerBandCount - 1, //
		StsRepeat = 29,											 // 0/1
		StsStopAfterTrack = 30,									 // 0/1
		StsPosition = 31,										 // seconds
		StsLength = 32,											 // seconds (read-only)
		StsRepeatPlaylist = 33,									 // 0/1: action on end of playlist == repeat
		StsRepeatSingleFilePlaylists = 34,						 // 0/1
		StsKbps = 35,											 // read-only
		StsKhz = 36,											 // read-only
		StsMode = 37,											 // same as StsPlayer
		StsRadioCapture = 38,									 // 0/1
		StsShuffle = 41,										 // 0/1
		StsTray = 45,											 // 0/1, minimized to tray
		StsTrueBass = 48,										 // 0..100 over [0 .. 2]
		StsEnhancer = 49,										 // 0..100 over [1 .. 4]
		StsTempo = 50,											 // 0..100 over [0.8 .. 1.5] (default 1.0 -> 28)
		StsPitch = 51,											 // 0..100 over [-10 .. +10]
		StsPreamp = 52,											 // 0..100 over [-15 .. +15] dB (the property reports dB, not the header's [0.5 .. 1.5])
	};

	constexpr int ActionOnEndOfPlaylistRepeat = 1;

	class Dispatcher
	{
	public:
		explicit Dispatcher(IAIMPCore *core)
		{
			core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&FService));
		}
		~Dispatcher()
		{
			if (FService)
				FService->Release();
		}
		explicit operator bool() const { return FService != nullptr; }

		template <typename T>
		std::optional<T> Get(int property, int hiWord = 0) const
		{
			T value{};
			if (!FService || Failed(FService->Send(property, AIMP_MSG_PROPVALUE_GET | (hiWord << 16), &value)))
				return std::nullopt;
			return value;
		}
		template <typename T>
		bool Set(int property, T value, int hiWord = 0) const
		{
			return FService && Succeeded(FService->Send(property, AIMP_MSG_PROPVALUE_SET | (hiWord << 16), &value));
		}

	private:
		IAIMPServiceMessageDispatcher *FService = nullptr;
	};

	struct RangeProperty
	{
		int Property;
		float Min, Max;
		int PivotPercent = 0;
		float PivotValue = Min;
	};

	std::optional<RangeProperty> RangeFor(int id)
	{
		switch (id)
		{
		case StsVolume:
			return RangeProperty{AIMP_MSG_PROPERTY_VOLUME, 0.0f, 1.0f};
		case StsBalance:
			return RangeProperty{AIMP_MSG_PROPERTY_BALANCE, -1.0f, 1.0f};
		case StsSpeed: // SDK header says [0.5 .. 1.5]; AIMP 6 accepts [0.5 .. 3.0]; client resets to 50
			return RangeProperty{AIMP_MSG_PROPERTY_SPEED, 0.5f, 3.0f, 50, 1.0f};
		case StsReverb:
			return RangeProperty{AIMP_MSG_PROPERTY_REVERB, 0.0f, 1.0f};
		case StsEcho:
			return RangeProperty{AIMP_MSG_PROPERTY_ECHO, 0.0f, 1.0f};
		case StsChorus:
			return RangeProperty{AIMP_MSG_PROPERTY_CHORUS, 0.0f, 1.0f};
		case StsFlanger:
			return RangeProperty{AIMP_MSG_PROPERTY_FLANGER, 0.0f, 1.0f};
		case StsTrueBass:
			return RangeProperty{AIMP_MSG_PROPERTY_TRUEBASS, 0.0f, 2.0f};
		case StsEnhancer: // header: [1 .. 4]; actual: [1 .. 5]; client resets to 0
			return RangeProperty{AIMP_MSG_PROPERTY_ENHANCER, 1.0f, 5.0f};
		case StsTempo: // header: [0.8 .. 1.5]; actual: [0.5 .. 3.0]; client resets to 28
			return RangeProperty{AIMP_MSG_PROPERTY_TEMPO, 0.5f, 3.0f, 28, 1.0f};
		case StsPitch:
			return RangeProperty{AIMP_MSG_PROPERTY_PITCH, -10.0f, 10.0f};
		case StsPreamp:
			return RangeProperty{AIMP_MSG_PROPERTY_PREAMP, -EqualizerBandRangeDb, EqualizerBandRangeDb};
		default:
			return std::nullopt;
		}
	}

	std::optional<int> BoolPropertyFor(int id)
	{
		switch (id)
		{
		case StsMute:
			return AIMP_MSG_PROPERTY_MUTE;
		case StsEqEnabled:
			return AIMP_MSG_PROPERTY_EQUALIZER;
		case StsRepeat:
			return AIMP_MSG_PROPERTY_REPEAT;
		case StsStopAfterTrack:
			return AIMP_MSG_PROPERTY_STOP_AFTER_TRACK;
		case StsRepeatSingleFilePlaylists:
			return AIMP_MSG_PROPERTY_REPEAT_SINGLE_FILE_PLAYLISTS;
		case StsRadioCapture:
			return AIMP_MSG_PROPERTY_RADIOCAP;
		case StsShuffle:
			return AIMP_MSG_PROPERTY_SHUFFLE;
		case StsTray:
			return AIMP_MSG_PROPERTY_MINIMIZED_TO_TRAY;
		default:
			return std::nullopt;
		}
	}

	int ToPercent(float value, const RangeProperty &r)
	{
		const bool lower = value < r.PivotValue && r.PivotPercent > 0;
		const float from = lower ? r.Min : r.PivotValue, to = lower ? r.PivotValue : r.Max;
		const float fromPercent = lower ? 0.0f : static_cast<float>(r.PivotPercent), toPercent = lower ? static_cast<float>(r.PivotPercent) : 100.0f;
		return static_cast<int>(std::floor(fromPercent + (value - from) / (to - from) * (toPercent - fromPercent)));
	}
	float FromPercent(int percent, const RangeProperty &r)
	{
		const bool lower = percent < r.PivotPercent && r.PivotPercent > 0;
		const float from = lower ? r.Min : r.PivotValue, to = lower ? r.PivotValue : r.Max;
		const float fromPercent = lower ? 0.0f : static_cast<float>(r.PivotPercent), toPercent = lower ? static_cast<float>(r.PivotPercent) : 100.0f;
		return from + (to - from) * (static_cast<float>(percent) - fromPercent) / (toPercent - fromPercent);
	}

	int CurrentFileInfoInt(IAIMPCore *core, int propId)
	{
		INT32 result = 0;
		IAIMPServicePlayer *player = nullptr;
		if (Succeeded(core->QueryInterface(IID_IAIMPServicePlayer, reinterpret_cast<void **>(&player))) && player)
		{
			IAIMPFileInfo *info = nullptr;
			if (Succeeded(player->GetInfo(&info)) && info)
			{
				info->GetValueAsInt32(propId, &result);
				info->Release();
			}
			player->Release();
		}
		return result;
	}

	std::optional<int> Access(IAIMPCore *core, int id, std::optional<int> value)
	{
		const Dispatcher d(core);

		if (const auto range = RangeFor(id))
		{
			if (value)
				d.Set(range->Property, FromPercent(*value, *range));
			return ToPercent(d.Get<float>(range->Property).value_or(range->Min), *range);
		}
		if (const auto property = BoolPropertyFor(id))
		{
			if (value)
				d.Set<BOOL>(*property, *value ? 1 : 0);
			return d.Get<BOOL>(*property).value_or(0) != 0 ? 1 : 0;
		}
		if (id >= StsEqBandFirst && id <= StsEqBandLast)
		{
			const int band = id - StsEqBandFirst;
			if (value)
				d.Set(AIMP_MSG_PROPERTY_EQUALIZER_BAND, EqualizerPercentToDb(*value), band);
			return EqualizerDbToPercent(d.Get<float>(AIMP_MSG_PROPERTY_EQUALIZER_BAND, band).value_or(0.0f));
		}

		switch (id)
		{
		case StsPlayer:
		case StsMode:
			return d.Get<INT32>(AIMP_MSG_PROPERTY_PLAYER_STATE).value_or(AIMP_PLAYER_STATE_STOPPED);
		case StsPosition:
			if (value)
				d.Set(AIMP_MSG_PROPERTY_PLAYER_POSITION, static_cast<float>(*value));
			return static_cast<int>(d.Get<float>(AIMP_MSG_PROPERTY_PLAYER_POSITION).value_or(0.0f));
		case StsLength:
			return static_cast<int>(std::ceil(d.Get<float>(AIMP_MSG_PROPERTY_PLAYER_DURATION).value_or(0.0f)));
		case StsRepeatPlaylist:
			if (value)
				d.Set<INT32>(AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST, *value ? ActionOnEndOfPlaylistRepeat : 0);
			return d.Get<INT32>(AIMP_MSG_PROPERTY_ACTION_ON_END_OF_PLAYLIST).value_or(0) == ActionOnEndOfPlaylistRepeat ? 1 : 0;
		case StsKbps:
			return CurrentFileInfoInt(core, AIMP_FILEINFO_PROPID_BITRATE);
		case StsKhz:
			return CurrentFileInfoInt(core, AIMP_FILEINFO_PROPID_SAMPLERATE) / 1000;
		default:
			return std::nullopt;
		}
	}
}

void StatusCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Status", [core = FCore](const nlohmann::json &params) -> nlohmann::json
			{
		if (!params.contains("status_id") || !params["status_id"].is_number_integer())
			throw RpcError(-32602, "status_id is required");
		const int id = params["status_id"].get<int>();
		std::optional<int> value;
		if (params.contains("value") && params["value"].is_number())
			value = static_cast<int>(std::lround(params["value"].get<double>()));

		const std::optional<int> result = RunOnMainThread(core, [&] { return Access(core, id, value); });
		if (!result)
			throw RpcError(-32602, "unknown status_id " + std::to_string(id));
		return {{"value", *result}}; });
}
