# AIMP Remote Control

An open-source plugin for remote control of [AIMP](https://www.aimp.ru/) over the local network: from a browser on a
mobile, a tablet or another computer, or from the **AIMP Remote Control** Android app. It runs on both the Windows and
the Linux builds of AIMP.

Not affiliated with the AIMP or the app authors.

## Features

- **Playlists:** every playlist of the player with its groups, covers and ratings; search in a playlist or across all of
  them; sorting, moving and removing tracks, and deleting their files where allowed.
- **Player:** playback, seeking, volume, shuffle and repeat, synced lyrics, track information, radio capture.
- **Queue, sleep timer, sound effects** with the equalizer and its presets.
- **Favorites**, kept on your device.
- **Adding music:** files of the player's computer, URLs, and uploads: drop files or whole folders from your device onto
  a playlist.
- **Downloading** tracks to your device.

## Clients

**A browser:** open `http://<address>:3333/`, the address is in the plugin's options (see [Setup](#setup)). It fits a
mobile as well as a wide screen, follows the system's light or dark theme and speaks English and Russian. Everything
above is there; the API behind it is documented in [docs/web-api.md](docs/web-api.md).

**The AIMP Remote Control app.** The original Android app (2.0.31) works with this plugin unchanged: the plugin speaks
the protocol of the original one, documented in [docs/remote-control-protocol.md](docs/remote-control-protocol.md).
Playlists, queue, playback, the equalizer, covers, lyrics, the file browser, uploads, downloads and the timer all work
as the app expects. The app is fading into the past: it is no longer maintained, it has been removed from Google Play,
and its [official site](https://aimpremote.blogspot.com) has no APK; in practice it is found in the
[4PDA thread](https://4pda.to/forum/index.php?showtopic=499539). Its protocol stays frozen, so new features come to the
browser.

## Security

Security is opt-in and configured in the player: HTTP Digest authentication, per-feature permissions (browsing the
computer's files, deleting tracks from disk, downloading and uploading tracks, timer), and per-interface listening — an
excluded network interface has no open port at all. Browsing and uploading are separate permissions in a browser; the
Android app reaches the file browser through its upload menu, so there it needs both.

## Installation

1. Download `aimp_remote_control.aimppack` from [Releases](../../releases).
2. Open it with AIMP: double-click it or drop it onto the player. If double-clicking does nothing, open _Options →
   Plugins_ and click _install_. The package contains the builds for all platforms; AIMP picks the right one.
3. Enable the plugin in _Options → Plugins_, then open `http://<address>:3333/` in a browser (see [Setup](#setup)).

Tested with AIMP 5 and AIMP 6.0 on Windows and Linux. AIMP 6.0 build 3090 or later reports its playlist view settings
and their changes itself; the plugin works around their absence in older versions.

## Setup

Open _Options → Plugins → Remote Control_:

- **Connection** lists the addresses the server listens on — open one in a browser as `http://<address>:3333/`, or enter
  it in the app, which can also discover the player on the local network. Untick an interface to stop listening on it.
- **Client permissions** — what browsers and the app may do beyond playback. Everything here is off by default,
  including browsing the computer's files, except downloading tracks to the client.
- **Require authentication** — a username and password to control the player; a browser asks for them once. Recommended
  on any network you do not fully trust: without it, anyone on the network can control the player.

Ports: TCP `3333` (control, from a browser and from the app), UDP `3332` (discovery for the app). Make sure the firewall
lets AIMP accept connections on them.

## Building

Clone with `--recurse-submodules`. Windows needs Visual Studio 2022+ with the C++ workload; Linux needs GCC 13+ (or
Clang with C++20 including `std::format`), CMake ≥ 3.28 and Ninja.

```powershell
.\plugin\build-windows.ps1       # Release, x64 + x86
```

```bash
./plugin/build-linux.sh            # Release
```

Artifacts land in `plugin/dist/<platform>/` together with `Langs` and `THIRD-PARTY-NOTICES.txt`. AIMP keeps the DLL
loaded, so close the player before rebuilding.

For the daily round there is one script per platform: it closes AIMP, links the player's `Plugins` folder at
`plugin/dist/<platform>/` (once), builds and starts AIMP again. It finds the installed player itself and builds for its
architecture; set `AIMP_DIR` for another one.

```powershell
.\plugin\deploy-windows.ps1     # -Config Debug, -NoStart, -Force
```

```bash
./plugin/deploy-linux.sh        # --debug, --no-start, --force; /opt/aimp by default
```

The AIMP in WSL is deployed from Windows with `.\plugin\deploy-wsl.ps1` (same options as `deploy-windows.ps1`); it runs
`deploy-linux.sh` there and starts the player through a `wsl.exe` that stays open with it.

After moving the repository, `-Force` / `--force` points the links at the new place; a real folder found where a link
belongs is renamed, not removed.

### Building the web client

The client in [web-client/](web-client/) is a Next.js app (App Router, static export) built separately from the plugin;
the plugin serves its build as `wwwroot/`.

```bash
cd web-client
npm install
npm run build     # web-client/out/
npm run dev       # localhost:3334, with /api rewritten to the player on 3333
```

The plugin looks for `wwwroot/` next to its binary; the deploy scripts link `plugin/dist/<platform>/wwwroot` at
`web-client/out`, so a client build shows up without copying. The link survives plugin rebuilds: the build scripts clear
`plugin/dist/<platform>/` without touching junctions and symlinks.

### Testing

The unit tests cover the code that needs no player:

```powershell
.\plugin\test-windows.ps1        # -Arch x64|x86, -Config Release|Debug
```

```bash
./plugin/test-linux.sh             # --debug
```

The end-to-end tests drive the API and the client against a throwaway copy of the installed AIMP, so close your own
first: `npm run e2e` in `web-client/`, `npm run e2e:api` for the API alone. See
[web-client/e2e/README.md](web-client/e2e/README.md) for what they need.

## Debugging

The binary cannot run on its own: you debug it inside AIMP. Both IDEs carry the same two configurations, _AIMP
(Windows)_ and _AIMP (WSL)_ — VS Code in [.vscode/launch.json](.vscode/launch.json), Visual Studio in
[plugin/launch.vs.json](plugin/launch.vs.json), with the `plugin/` folder opened. The VS Code ones run the deploy script
for Debug first and leave AIMP stopped, for the debugger to start it. Debugging in WSL needs `gdb` in the distro
(`sudo apt-get install -y gdb`).

Breakpoints bind only against the symbols of the binary AIMP actually loaded: on Windows the `.pdb` has to sit next to
the DLL — the build script copies it into `plugin/dist/` whenever it exists — and on Linux `strip` runs for Release
only, so build with `--debug`.

## Project layout

| Path                                         | What                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin/src/plugin.cpp`                      | AIMP plugin entry point, wiring of servers and commands                                                                                          |
| `plugin/src/remoteControlServer.*`           | HTTP/JSON‑RPC server (one listener per allowed address)                                                                                          |
| `plugin/src/serviceDiscoveryServer.*`        | UDP discovery responder                                                                                                                          |
| `plugin/src/digestAuthenticator.*`           | HTTP Digest authentication and the failed-attempt limiter                                                                                        |
| `plugin/src/stateUpdateEvents.*`             | what changes in the player, for the long polls of the app and the events of the web client                                                       |
| `plugin/src/player/`                         | protocol-neutral operations on the player: playlists, playback, queue, effects, search, covers, lyrics, files, uploads; shared by both protocols |
| `plugin/src/rpcApi/`                         | the frozen protocol of the app: one class per RPC method / HTTP endpoint                                                                         |
| `plugin/src/webApi/`                         | the `/api/v1` of the web client: one controller per resource                                                                                     |
| `plugin/src/helpers/`                        | AIMP SDK plumbing, encodings, hashes, system utilities such as the network watcher                                                               |
| `plugin/src/optionsFrame.*`, `plugin/Langs/` | options page and its localization                                                                                                                |
| `plugin/src/sleepTimer.*`                    | sleep timer behind the `Scheduler` command and `/api/v1/timer`                                                                                   |
| `web-client/`                                | the web client (Next.js, static export); builds into `web-client/out/`                                                                           |
| `web-client/e2e/`                            | end-to-end tests of the API and the client against a throwaway AIMP (Playwright)                                                                 |
| `plugin/tests/`                              | unit tests of the code that needs no player; `test-windows.ps1` / `test-linux.sh` run them                                                       |
| `docs/remote-control-protocol.md`            | the app's protocol, frozen                                                                                                                       |
| `docs/web-api.md`                            | the web client's `/api/v1`                                                                                                                       |
| `docs/catalog/`                              | files for the entry in the AIMP addons catalog                                                                                                   |

## License

[MIT](LICENSE.txt). Bundled third-party libraries keep their own licenses; their texts are collected into
`THIRD-PARTY-NOTICES.txt` (generated at build time, shipped with every release).

[plugin/third_party/aimp-sdk](plugin/third_party/aimp-sdk) is the official AIMP SDK, © Artem Izmaylov
([aimp.ru](https://www.aimp.ru/)), vendored unchanged. It ships without an explicit license text and is not covered by
this project's MIT license.
