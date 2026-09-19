#pragma once

#include <cmath>

constexpr int EqualizerBandCount = 18;
constexpr float EqualizerBandRangeDb = 15.0f;

inline int EqualizerDbToPercent(float db)
{
	return static_cast<int>(std::floor((db + EqualizerBandRangeDb) / (2 * EqualizerBandRangeDb) * 100.0f));
}

inline float EqualizerPercentToDb(int percent)
{
	return -EqualizerBandRangeDb + 2 * EqualizerBandRangeDb * static_cast<float>(percent) / 100.0f;
}
