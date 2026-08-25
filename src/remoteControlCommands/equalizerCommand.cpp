#include "equalizerCommand.h"

#include <optional>
#include <vector>

#include <nlohmann/json.hpp>

#include "apiCore.h"
#include "apiMessages.h"
#include "equalizerBands.h"
#include "mainThreadRunner.h"

void EqualizerCommand::Register(IRpcRegistrar &rpc)
{
	rpc.Add("Equalizer", [core = FCore](const nlohmann::json &params) -> nlohmann::json
			{
		std::optional<bool> active;
		if (params.contains("active") && params["active"].is_boolean())
			active = params["active"].get<bool>();
		std::vector<int> bands;
		if (params.contains("bands") && params["bands"].is_array())
			bands = params["bands"].get<std::vector<int>>();
		if (!bands.empty() && bands.size() != EqualizerBandCount)
			throw RpcError(-32602, "bands must contain 18 values");

		return RunOnMainThread(core, [&]() -> nlohmann::json
		{
			nlohmann::json result{{"active", false}, {"bands", nlohmann::json::array()}};
			IAIMPServiceMessageDispatcher *dispatcher = nullptr;
			if (Failed(core->QueryInterface(IID_IAIMPServiceMessageDispatcher, reinterpret_cast<void **>(&dispatcher))) || !dispatcher)
				return result;

			if (active)
			{
				BOOL value = *active ? 1 : 0;
				dispatcher->Send(AIMP_MSG_PROPERTY_EQUALIZER, AIMP_MSG_PROPVALUE_SET, &value);
			}
			for (int band = 0; band < static_cast<int>(bands.size()); ++band)
			{
				float value = EqualizerPercentToDb(bands[band]);
				dispatcher->Send(AIMP_MSG_PROPERTY_EQUALIZER_BAND, AIMP_MSG_PROPVALUE_SET | (band << 16), &value);
			}

			BOOL enabled = 0;
			dispatcher->Send(AIMP_MSG_PROPERTY_EQUALIZER, AIMP_MSG_PROPVALUE_GET, &enabled);
			result["active"] = enabled != 0;
			for (int band = 0; band < EqualizerBandCount; ++band)
			{
				float value = 0.0f;
				dispatcher->Send(AIMP_MSG_PROPERTY_EQUALIZER_BAND, AIMP_MSG_PROPVALUE_GET | (band << 16), &value);
				result["bands"].push_back(EqualizerDbToPercent(value));
			}
			dispatcher->Release();
			return result;
		}); });
}
