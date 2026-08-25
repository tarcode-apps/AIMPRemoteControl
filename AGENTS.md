# Agent guide

Instructions for AI coding agents (and a fast on-ramp for contributors).
Start with [README.md](README.md) for what the project is; this file adds the
constraints and conventions that are not obvious from the code.

## What matters most

- **The wire protocol is frozen.** The Android app (v2.0.31) is unmaintained
  and will never update, so compatibility with it is the prime directive.
  [docs/remote-control-protocol.md](docs/remote-control-protocol.md) is the
  contract — read it before changing anything in `src/remoteControlCommands/`
  or the servers. The `Version` command must keep reporting protocol version
  `1.2.0.5`; deliberate differences from the original plugin are called out in
  the protocol doc.
- **Never edit `third_party/`.** Libraries are git submodules;
  `third_party/aimp-sdk` is the official AIMP SDK vendored unchanged (and has
  no explicit license — see README). Work around SDK quirks from outside:
  `third_party/shims/` and the cairo stub in `CMakeLists.txt` show how.
- **Do not mask errors.** No defensive try/catch with silent fallbacks around
  data that is simply broken (e.g. a malformed localization format string
  should fail loudly, not degrade quietly). Report problems; don't paper over
  them.
- **Exactly one export.** The binary must export `AIMPPluginGetHeader` and
  nothing else (`src/plugin.def` on Windows, `src/plugin.map` on Linux; hidden
  visibility elsewhere). The build scripts verify this — keep that check green.
- **Windows Release links the CRT statically** (`AIMP_MSVC_STATIC_RUNTIME`,
  `/MT`): the plugin ships to machines without the VC++ Redistributable. Don't
  add dependencies that break this.

## Building

Clone with `--recurse-submodules` (the build scripts check and tell you if you
forgot). Then, from the repo root:

- Windows (needs Visual Studio 2022+ with the C++ workload; the script finds
  the toolchain itself via vswhere): `.\build-windows.ps1` — Release for
  x64 + x86; options `-Arch x64|x86`, `-Config Release|Debug`, `-Clean`.
- Linux (GCC 13+, CMake ≥ 3.28, Ninja): `./build-linux.sh` — options
  `--debug`, `--clean`. Works in WSL too.

Artifacts land in `dist/<platform>/`: the binary plus `Langs/`, `wwwroot/` and
`THIRD-PARTY-NOTICES.txt` (generated at configure time from the submodules'
license files). CI (`.github/workflows/build.yml`) runs the same scripts and
packages everything into an `.aimppack`.

Notes:

- Source files under `src/` are globbed (`CONFIGURE_DEPENDS`) — adding or
  removing a file needs no CMake edits.
- AIMP keeps the plugin binary loaded: **close the player before building** or
  the copy to `dist/` fails.
- To test, put the `dist/<platform>/` contents into
  `<AIMP>/Plugins/aimp_remote_control/` (a junction/symlink to `dist/` saves
  copying; on Windows the profile `%APPDATA%\AIMP\Plugins` works too) and
  enable the plugin in AIMP options. Debug configs for VS Code (`.vscode/`)
  and Visual Studio (`launch.vs.json`) exist for both Windows and WSL.

## Verifying changes

There are no unit tests; the test bench is a running AIMP. Quick smoke test
(port 3333, method names are in the protocol doc):

```bash
curl -s -X POST http://localhost:3333/RPC_JSON \
  -d '{"jsonrpc":"2.0","id":1,"method":"GetPlayerControlPanelState"}'
```

The static web UI at `http://localhost:3333/` exercises the same API from a
browser. UDP discovery answers on port 3332. When touching auth, payload
limits, or upload paths, test the unhappy paths too (wrong digest, oversized
and chunked bodies, disabled permissions).

## Architecture in one minute

`src/plugin.cpp` is the entry point: it wires settings, the HTTP/JSON-RPC
server (`remoteControlServer.*`, one listener per allowed interface), the UDP
discovery responder (`serviceDiscoveryServer.*`), the options page
(`optionsFrame.*`) and one command class per RPC method / HTTP endpoint under
`src/remoteControlCommands/`. `src/helpers/` holds AIMP SDK wrappers, JSON
helpers and the network-interface watcher.

Things that bite:

- **Thread affinity.** HTTP requests run on httplib worker threads, but AIMP
  SDK objects must be used on the player's main thread. Marshal with the
  helpers in `src/helpers/mainThreadRunner.h`: blocking `RunOnMainThread` for
  request handling, fire-and-forget `PostToMainThread` for notifications from
  background threads (blocking there can deadlock against `Finalize`).
- **AIMP SDK style.** COM-like: `QueryInterface`/`AddRef`/`Release`, `HRESULT`
  returns, `IAIMPString` for strings. Use the RAII/helper wrappers in
  `src/helpers/aimpHelper.h` rather than manual reference counting.
- **Long polling.** The app keeps up to four `SubscribeOnAIMPStateUpdateEvent`
  requests pending (~10 min each) and opens a new TCP connection per request.
  Related: the digest-auth nonce lifetime (15 min) is deliberately longer than
  the long-poll timeout.
- **Limits are asymmetric.** JSON-RPC bodies are capped at 16 MB before
  authentication; only registered upload endpoints may receive up to 2 GB.
- **Localization.** `Langs/*.lng` are UTF-16LE with BOM and CRLF line endings
  — preserve both, git treats them as binary. Keys used in code must exist in
  every language file; format placeholders (`{0}`) must survive translation.
  The options page reloads localized captions via `ApplyLocalization`.

## Code conventions

- Match the surrounding code: naming, indentation (tabs in `src/`), and its
  low comment density — comment only constraints the code cannot express.
- Some files historically have mixed line endings; don't reformat wholesale or
  touch lines unrelated to your change.
- C++20, no exceptions policy surprises: exceptions are used (`RpcError` maps
  to protocol error codes from the doc's Errors table); pick existing error
  codes, never invent new ones the app doesn't know.
