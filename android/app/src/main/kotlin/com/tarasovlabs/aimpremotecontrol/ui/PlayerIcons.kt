package com.tarasovlabs.aimpremotecontrol.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import com.tarasovlabs.aimpremotecontrol.R
import com.tarasovlabs.aimpremotecontrol.players.PlayerIcon

@get:DrawableRes
val PlayerIcon.drawable: Int
    get() = when (this) {
        PlayerIcon.Desktop -> R.drawable.ic_player_desktop
        PlayerIcon.Laptop -> R.drawable.ic_player_laptop
        PlayerIcon.LivingRoom -> R.drawable.ic_player_living_room
        PlayerIcon.Study -> R.drawable.ic_player_study
        PlayerIcon.Bedroom -> R.drawable.ic_player_bedroom
        PlayerIcon.Kitchen -> R.drawable.ic_player_kitchen
        PlayerIcon.Garage -> R.drawable.ic_player_garage
        PlayerIcon.Home -> R.drawable.ic_player_home
        PlayerIcon.Speaker -> R.drawable.ic_player_speaker
        PlayerIcon.Tv -> R.drawable.ic_player_tv
        PlayerIcon.Headphones -> R.drawable.ic_player_headphones
        PlayerIcon.Music -> R.drawable.ic_player_music
    }

@get:StringRes
val PlayerIcon.label: Int
    get() = when (this) {
        PlayerIcon.Desktop -> R.string.icon_desktop
        PlayerIcon.Laptop -> R.string.icon_laptop
        PlayerIcon.LivingRoom -> R.string.icon_living_room
        PlayerIcon.Study -> R.string.icon_study
        PlayerIcon.Bedroom -> R.string.icon_bedroom
        PlayerIcon.Kitchen -> R.string.icon_kitchen
        PlayerIcon.Garage -> R.string.icon_garage
        PlayerIcon.Home -> R.string.icon_home
        PlayerIcon.Speaker -> R.string.icon_speaker
        PlayerIcon.Tv -> R.string.icon_tv
        PlayerIcon.Headphones -> R.string.icon_headphones
        PlayerIcon.Music -> R.string.icon_music
    }
