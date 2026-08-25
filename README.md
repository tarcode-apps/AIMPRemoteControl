# AIMP Remote Control plugin

Open-source server plugin for [AIMP](https://www.aimp.ru/) that lets the
**AIMP Remote Control** Android app control the player over Wi‑Fi. It speaks the
same protocol as the original plugin, so the app works unchanged, and it runs on
both the Windows and the Linux builds of AIMP.

Not affiliated with the AIMP or the app authors.

## Features

Everything the app asks for: playlists and queue, playback control, status
sliders and effects, 18‑band equalizer, covers, lyrics, ratings, search, file
browser and adding files/URLs, uploading and downloading tracks, sleep timer,
real-time push of player state. The protocol is documented in
[docs/remote-control-protocol.md](docs/remote-control-protocol.md).

Security is opt-in and configured in the player: HTTP Digest authentication,
per-feature permissions (browsing the computer's files, deleting tracks from
disk, uploading tracks, timer), and per-interface listening — an excluded
network interface has no open port at all.

## The Android app

The **AIMP Remote Control** app is no longer maintained: it has been removed
from Google Play, and its bundled plugin only supports old AIMP versions —
which is why this plugin exists. The app itself still works fine on current
Android, but there is no official download anymore (the
[official site](https://aimpremote.blogspot.com) has no APK); in practice the
APK can be found in the
[4PDA thread](https://4pda.to/forum/index.php?showtopic=499539). This plugin
targets the app's last released version (2.0.31).

## Installation

1. Download `aimp_remote_control.aimppack` from [Releases](../../releases) (or
   the artifact of a build in [Actions](../../actions)).
2. Open it with AIMP (double-click or drop it onto the player) and confirm the
   installation. The package contains the builds for all platforms; AIMP picks
   the right one.

   Manual alternative: the `.aimppack` is a plain zip — unpack the
   `aimp_remote_control` folder into `Plugins` of either the AIMP installation
   folder (`C:\Program Files\AIMP\Plugins`) or the profile
   (`%APPDATA%\AIMP\Plugins`).
3. Restart AIMP and enable the plugin in *Options → Plugins*.

Tested with AIMP 6.0 on Windows and Linux; AIMP 5.x should work but has not
been verified.

## Setup

Open *Options → Plugins → Remote Control*:

- **Connection** lists the addresses the server listens on — enter one of them
  in the app, or let the app discover the player on the local network. Untick
  an interface to stop listening on it.
- **Client permissions** — what the app is allowed to do beyond playback.
  Everything here is off by default, including browsing the computer's files
  from the app.
- **Require authentication** — username and password the app must use.
  Recommended on any network you do not fully trust: without it, anyone on
  the network can control the player.

Ports: TCP `3333` (JSON‑RPC over HTTP), UDP `3332` (discovery). Make sure the
firewall lets AIMP accept connections on them.

## Building

Clone with `--recurse-submodules`. Windows needs Visual Studio 2022+ with the
C++ workload; Linux needs GCC 13+ (or Clang with C++20 including `std::format`),
CMake ≥ 3.28 and Ninja.

```powershell
.\build-windows.ps1              # Release, x64 + x86
```

```bash
./build-linux.sh                   # Release
```

Artifacts land in `dist/<platform>/` together with `Langs`, `wwwroot` and
`THIRD-PARTY-NOTICES.txt`. AIMP keeps the DLL loaded, so close the player
before rebuilding. The same scripts run in
[GitHub Actions](.github/workflows/build.yml).

## Project layout

| Path | What |
|---|---|
| `src/plugin.cpp` | AIMP plugin entry point, wiring of servers and commands |
| `src/remoteControlServer.*` | HTTP/JSON‑RPC server (one listener per allowed address) |
| `src/serviceDiscoveryServer.*` | UDP discovery responder |
| `src/remoteControlCommands/` | one class per RPC method / HTTP endpoint |
| `src/helpers/` | AIMP SDK helpers, network interface enumeration and watcher, JSON helpers |
| `src/optionsFrame.*`, `Langs/` | options page and its localization |
| `src/sleepTimer.*` | timer behind the `Scheduler` command |
| `docs/remote-control-protocol.md` | protocol reference |

## License

[MIT](LICENSE.txt). Bundled third-party libraries keep their own licenses;
their texts are collected into `THIRD-PARTY-NOTICES.txt` (generated at build
time, shipped with every release).

[third_party/aimp-sdk](third_party/aimp-sdk) is the official AIMP SDK,
© Artem Izmaylov ([aimp.ru](https://www.aimp.ru/)), vendored unchanged. It
ships without an explicit license text and is not covered by this project's
MIT license.
