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
disk, downloading and uploading tracks, timer), and per-interface listening — an excluded
network interface has no open port at all. Browsing and uploading are separate
permissions for the web client; the Android app reaches the file browser
through its upload menu, so there it needs both.

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
   the artifact of a build in [Actions](../../actions); CI builds on `v*` tags
   and on request).
2. Open it with AIMP: double-click it or drop it onto the player. If
   double-clicking does nothing, open *Options → Plugins* and click *install*.
   The package contains the builds for all platforms; AIMP picks the right one.
3. Enable the plugin in *Options → Plugins*.

Tested with AIMP 5 and AIMP 6.0 on Windows and Linux. AIMP 6.0 build 3090 or
later reports its playlist view settings and their changes itself; the plugin
works around their absence in older versions.

## Setup

Open *Options → Plugins → Remote Control*:

- **Connection** lists the addresses the server listens on — enter one of them
  in the app, or let the app discover the player on the local network. Untick
  an interface to stop listening on it.
- **Client permissions** — what the app is allowed to do beyond playback.
  Everything here is off by default, including browsing the computer's files
  from the app, except downloading tracks to the client.
- **Require authentication** — username and password the app must use. It
  guards the API, not the pages: `wwwroot/` is served to anyone, while every
  command, cover and track transfer needs the credentials. Recommended on any
  network you do not fully trust: without it, anyone on the network can control
  the player.

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

Artifacts land in `dist/<platform>/` together with `Langs` and
`THIRD-PARTY-NOTICES.txt`. AIMP keeps the DLL loaded, so close the player
before rebuilding. The same scripts run in
[GitHub Actions](.github/workflows/build.yml).

For the daily round there is one script per platform: it closes AIMP, links
the player's `Plugins` folder at `dist/<platform>/` (once), builds and starts
AIMP again. It finds the installed player itself and builds for its
architecture; set `AIMP_DIR` for another one.

```powershell
.\deploy-windows.ps1            # -Config Debug, -NoStart, -Force
```

```bash
./deploy-linux.sh               # --debug, --no-start, --force; /opt/aimp by default
```

The AIMP in WSL is deployed from Windows with `.\deploy-wsl.ps1` (same
options as `deploy-windows.ps1`); it runs `deploy-linux.sh` there and starts
the player through a `wsl.exe` that stays open with it.

After moving the repository, `-Force` / `--force` points the links at the new
place; a real folder found where a link belongs is renamed, not removed.

### The web client

The client in [web-client/](web-client/) is a Next.js app (App Router, static
export) built separately from the plugin;
[GitHub Actions](.github/workflows/build.yml) ships `web-client/out/` as the
plugin's `wwwroot/`.

```bash
cd web-client
npm install
npm run build     # web-client/out/
npm run dev       # localhost:3334, with /api rewritten to the player on 3333
```

The plugin looks for `wwwroot/` next to its binary; the deploy scripts link
`dist/<platform>/wwwroot` at `web-client/out`, so a client build shows up
without copying. The link survives plugin rebuilds: the build scripts clear
`dist/<platform>/` without touching junctions and symlinks.

## Debugging

The binary cannot run on its own: you debug it inside AIMP. Both IDEs carry
the same two configurations, *AIMP (Windows)* and *AIMP (WSL)* — VS Code in
[.vscode/launch.json](.vscode/launch.json), Visual Studio in
[launch.vs.json](launch.vs.json). The VS Code ones run the deploy script for
Debug first and leave AIMP stopped, for the debugger to start it. Debugging in
WSL needs `gdb` in the distro (`sudo apt-get install -y gdb`).

Breakpoints bind only against the symbols of the binary AIMP actually loaded:
on Windows the `.pdb` has to sit next to the DLL — the build script copies it
into `dist/` whenever it exists — and on Linux `strip` runs for Release only,
so build with `--debug`.

## Project layout

| Path | What |
|---|---|
| `src/plugin.cpp` | AIMP plugin entry point, wiring of servers and commands |
| `src/remoteControlServer.*` | HTTP/JSON‑RPC server (one listener per allowed address) |
| `src/serviceDiscoveryServer.*` | UDP discovery responder |
| `src/digestAuthenticator.*` | HTTP Digest authentication and the failed-attempt limiter |
| `src/stateUpdateEvents.*` | what changes in the player, for the long polls of the app and the events of the web client |
| `src/player/` | protocol-neutral operations on the player, shared by both protocols |
| `src/rpcApi/` | the frozen protocol of the app: one class per RPC method / HTTP endpoint |
| `src/webApi/` | the `/api/v1` of the web client: one controller per resource |
| `src/helpers/` | AIMP SDK helpers, network interface enumeration and watcher, JSON helpers |
| `src/optionsFrame.*`, `Langs/` | options page and its localization |
| `src/sleepTimer.*` | sleep timer behind the `Scheduler` command and `/api/v1/timer` |
| `src/player/effects.*` | balance, sound effects and the equalizer with its presets, behind `/api/v1/effects` |
| `web-client/` | the web client (Next.js, static export); builds into `web-client/out/` |
| `web-client/e2e/` | end-to-end tests of the API and the client against a throwaway AIMP (Playwright) |
| `tests/` | unit tests of the code that needs no player; `test-windows.ps1` / `test-linux.sh` run them |
| `docs/remote-control-protocol.md` | the app's protocol, frozen |
| `docs/web-api.md` | the web client's `/api/v1` |
| `docs/catalog/` | files for the entry in the AIMP addons catalog |

## License

[MIT](LICENSE.txt). Bundled third-party libraries keep their own licenses;
their texts are collected into `THIRD-PARTY-NOTICES.txt` (generated at build
time, shipped with every release).

[third_party/aimp-sdk](third_party/aimp-sdk) is the official AIMP SDK,
© Artem Izmaylov ([aimp.ru](https://www.aimp.ru/)), vendored unchanged. It
ships without an explicit license text and is not covered by this project's
MIT license.
