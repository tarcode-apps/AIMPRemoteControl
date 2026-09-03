# AIMP Remote Control protocol

This document describes the network protocol between the **AIMP Remote Control**
Android app and the player-side plugin, as implemented by this project. It was
reconstructed from traffic captures of the original plugin (versions 1.2.0.5
under AIMP 4.70 / 5.40) and verified against the app; where this implementation
deliberately differs from the original, the difference is called out.

Contents

1. [Overview](#1-overview)
2. [Transport](#2-transport)
3. [Authentication](#3-authentication)
4. [Identifiers and data types](#4-identifiers-and-data-types)
5. [Errors](#5-errors)
6. [Discovery (UDP)](#6-discovery-udp)
7. [JSON-RPC methods](#7-json-rpc-methods)
8. [Long polling: `SubscribeOnAIMPStateUpdateEvent`](#8-long-polling-subscribeonaimpstateupdateevent)
9. [HTTP endpoints](#9-http-endpoints)
10. [Session walkthrough](#10-session-walkthrough)

---

## 1. Overview

| | |
|---|---|
| Control channel | JSON-RPC 2.0 over HTTP, `POST /RPC_JSON`, TCP port **3333** |
| Binary data | plain HTTP `GET`/`POST` on the same port (covers, track download/upload) |
| Push | long polling via the `SubscribeOnAIMPStateUpdateEvent` method |
| Discovery | UDP port **3332**, request/response with the host name |
| Authentication | HTTP Digest (optional, configured on the player) |
| Encoding | UTF‑8 JSON; all strings are UTF‑8 |

The player is the **server**; the app is the **client**. The server must be
multi-threaded: the client keeps up to four long-poll requests pending while it
issues normal requests, and it opens a **new TCP connection for every request**
(it sends `Connection: Keep-Alive` but never reuses connections).

---

## 2. Transport

### 2.1 JSON-RPC

Requests are `POST /RPC_JSON` with `Content-Type: application/json` and a JSON-RPC
2.0 body. `params` is always an **object** with named parameters (or omitted);
`id` is any integer, negative values included.

```http
POST /RPC_JSON HTTP/1.1
Host: 192.168.1.10:3333
Content-Type: application/json
Authorization: Digest username="alice", realm="AIMP Remote Control", ...

{
  "jsonrpc": "2.0",
  "id": 17,
  "method": "GetPlaylists",
  "params": {
    "fields": ["id", "title", "crc32"]
  }
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 17,
  "result": [
    {
      "id": 191542976,
      "title": "Music",
      "crc32": -1180465611
    }
  ]
}
```

Successful responses carry `result` (which may be `null` for some methods);
failures carry `error: {code, message}` (see [Errors](#5-errors)). Batch requests
are not used.

### 2.2 HTTP endpoints

Album art, track download and track upload use plain HTTP on the same port and
are protected by the same Digest authentication. They are listed in
[section 9](#9-http-endpoints).

---

## 3. Authentication

Authentication is optional and enabled in the plugin settings. When enabled,
every request of this protocol (RPC, GET and POST alike) must carry HTTP Digest
credentials ([RFC 7616](https://www.rfc-editor.org/rfc/rfc7616)). Static files
under `wwwroot/` are outside the protocol and are served without credentials;
the app never requests them.

| Parameter | Value |
|---|---|
| `realm` | `AIMP Remote Control` (fixed) |
| `algorithm` | `MD5` |
| `qop` | `auth` (legacy RFC 2069 without `qop` is accepted too) |
| `nonce` | `<unix-time>:<MD5(unix-time ":" secret)>` — stateless, verifiable by the server |

An unauthenticated request gets `401 Unauthorized` with
`WWW-Authenticate: Digest realm="AIMP Remote Control", qop="auth", algorithm=MD5, nonce="…"`.
When the credentials are right but the nonce is older than **24 hours**, the
server answers `401` with `stale=true` so the client can retry with the fresh
nonce without asking the user again.

Implementation notes that matter for compatibility:

- The nonce is derived from the configured credentials and the time only, so it
  stays valid across player restarts. The app caches the nonce for days and
  does **not** retry every request after a `401`; a nonce that changed on
  restart would break it.
- Failed credentials are rate-limited to **one verification per second per
  client address**. A credential-bearing request that arrives inside that window
  gets the ordinary `401` challenge without being checked, so it is
  indistinguishable from a wrong password. Correct credentials are never
  throttled and a request without an `Authorization` header is not an attempt,
  so a well-behaved client never notices. This is an addition to the original
  plugin, which had no limit.
- The `uri` in the `Authorization` header may be an absolute URL
  (`http://host:3333/downloadTrack/…`) — Android's DownloadManager signs it that
  way. The server compares only the path part.

---

## 4. Identifiers and data types

| Type | Description |
|---|---|
| `playlist_id` | signed 32‑bit integer. Stable across player restarts: CRC32 of AIMP's internal playlist ID (top bit cleared), with linear probing on collision. The app caches playlist IDs between sessions. |
| `track_id` | signed 32‑bit integer, unique across all playlists. CRC32 of `<internal playlist id>:<index in playlist>`, top bit cleared, probing on collision. Stable across restarts as long as the playlist is unchanged; deleting or reordering tracks shifts the IDs together with the indexes — the client refetches the list when it receives `playlists_content_change`. |
| `crc32` (of a playlist) | signed 32‑bit: CRC32 over the UTF‑8 file names of all entries. Changes when content changes; the client compares it to decide whether to reload. |
| `duration` (in lists and `GetPlaylistEntryInfo`) | **milliseconds**. This implementation reports whole seconds rounded *up*, as AIMP displays them (`ceil(seconds) * 1000`, e.g. 266.4 s → `267000`); the original plugin sent the exact value (`222576`). Either is fine for the app. |
| `track_length`, `track_position` (`GetPlayerControlPanelState`) | **seconds** |
| `rating` | float `0.0..5.0` in responses, integer `0..5` in requests |
| `enabled` | boolean — the check box in front of the track in AIMP |
| percentage values (`Status`, `Equalizer`) | integers `0..100` |
| paths | OS paths as strings (`C:\Music\a.mp3`, `/home/me/a.mp3`); URLs for radio streams |

---

## 5. Errors

JSON-RPC errors look like `{"code": 21, "message": "Getting info about track failed. Reason: track not found."}`.

| Code | Meaning |
|---|---|
| `-32602` | invalid params: required field missing, unknown `status_id`, unknown event name, etc. |
| `-32000` | server is stopping (returned to pending long polls on shutdown) |
| `-1` | scheduler not available (timer functions disabled in settings) |
| `18` | enqueue failed |
| `19` | removing from queue failed |
| `20` | playlist not found |
| `21` | track not found (unknown or stale `track_id`) |
| `22` | album cover not found |
| `27` | adding files / URL failed |
| `28` | removing track failed (including: physical deletion disabled in settings) |
| `29` | renaming playlist failed |
| `30` | creating playlist failed |
| `31` | removing playlist failed |
| `33` | path inaccessible (`BrowseFiles`) |
| `35` | lyrics not available |

HTTP endpoints use HTTP status codes (`401`, `403`, `404`, `400`, `500`).

---

## 6. Discovery (UDP)

The app can find players on the local network by broadcasting to UDP port 3332.

| | |
|---|---|
| Request | any UDP datagram to `<broadcast>:3332` (the payload is ignored) |
| Response | the player's **host name** as a plain string (no terminator), sent to the requester's address and port |

The app then offers the responder's IP address with port 3333. The server
answers only on the network interfaces that are enabled in its settings.

---

## 7. JSON-RPC methods

Notation: `params → result`. Optional parameters are marked `?`.

### 7.1 Player information

#### `Version`

`{} → {"aimp_version": string, "plugin_version": string}`

```json
{
  "aimp_version": "v6.00.3080 Beta 5",
  "plugin_version": "1.2.0.5"
}
```

`plugin_version` is the protocol version the app expects from the original
plugin and is kept at `1.2.0.5`.

#### `PluginCapabilities`

`{} → {"physical_track_deletion": bool, "upload_track": bool, "scheduler": {"supported": bool, "allowed": bool}}`

Reflects the permissions configured on the player. `scheduler.supported` is
always `true`; `allowed` follows the settings.

#### `GetPlayerControlPanelState`

`{} →`

```json
{
  "playback_state": "playing",          // "playing" | "paused" | "stopped"
  "playlist_id": 191542976,
  "track_id": 1723812340,
  "track_length": 204,                   // seconds, rounded up
  "track_position": 37,                  // seconds
  "volume": 80,                          // 0..100
  "mute_mode_on": false,
  "repeat_mode_on": false,
  "shuffle_mode_on": false,
  "radio_capture_mode_on": false,
  "current_track_source_radio": false
}
```

When `playback_state` is `"stopped"`, `playlist_id`/`track_id` still describe
the track the player would start (the focused item of the active playlist), and
`track_length`, `track_position`, `current_track_source_radio` are absent.

### 7.2 Playlists and entries

#### `GetPlaylists`

`{"fields": [string, …]} → [ {field: value, …}, … ]`

One object per loaded playlist, containing the requested fields only:

| Field | Type | Description |
|---|---|---|
| `id` | int | `playlist_id` |
| `title` | string | playlist name |
| `readonly` | bool | playlist is read-only |
| `entries_count` | int | number of entries |
| `crc32` | int | content checksum (see [section 4](#4-identifiers-and-data-types)) |

```json
// request
{
  "fields": ["id", "title", "entries_count", "crc32"]
}
// result
[
  {
    "id": 191542976,
    "title": "Music",
    "entries_count": 2,
    "crc32": -1180465611
  },
  {
    "id": 918273645,
    "title": "Default",
    "entries_count": 0,
    "crc32": 0
  }
]
```

#### `GetPlaylistEntries`

Two forms:

- `{"playlist_id": int, "fields": [...]}` — entries of one playlist; the result
  includes `total_entries_count`.
- `{"search_string": string, "fields": [...]}` — case-insensitive substring
  search over title, artist, album, genre and folder name across **all**
  playlists (include `"playlist_id"` in `fields` to know where a hit lives); no
  `total_entries_count`.

`→ {"count_of_found_entries": int, "total_entries_count"?: int, "entries": [[…], …]}`

Each entry is an **array in the order of `fields`** (not an object — this keeps
large playlists small). Available fields:

| Field | Type | Description |
|---|---|---|
| `id` | int | `track_id` |
| `playlist_id` | int | |
| `title` | string | tag title, or the file name without extension when the tag is empty (as AIMP shows it) |
| `artist`, `album`, `genre`, `date` | string | tags |
| `duration` | int | milliseconds (see [section 4](#4-identifiers-and-data-types)) |
| `filename` | string | full path or URL |
| `foldername` | string | name of the parent folder |
| `filesize` | int | bytes |
| `bitrate` | int | kbps |
| `samplerate` | int | Hz |
| `channels_count` | int | |
| `rating` | float | `0.0..5.0` |
| `enabled` | bool | |
| `queue_index` | int | position in the play queue (meaningful in `GetQueuedEntries`) |

Unknown field names yield `null` in that position.

```json
// request
{
  "playlist_id": 191542976,
  "fields": ["title", "artist", "duration", "id", "album", "genre", "foldername", "rating", "enabled"]
}
// result
{
  "count_of_found_entries": 2,
  "total_entries_count": 2,
  "entries": [
    ["Track One", "Artist A", 267000, 1723812340, "Album X", "Rock", "Music", 4.0, true],
    ["Track Two", "Artist B", 161000, 1723812341, "", "", "Music", 0.0, true]
  ]
}
```

There is no pagination; a 16 000‑entry playlist is ~1.8 MB.

#### `GetPlaylistEntryInfo`

`{"track_id": int} →`

```json
{
  "album": "Album X",
  "artist": "Artist A",
  "bitrate": 320,
  "channels_count": 2,
  "date": "2018",
  "duration": 267000,
  "filesize": 10657834,
  "genre": "Rock",
  "id": 1723812340,
  "playlist_id": 191542976,
  "rating": 4.0,
  "samplerate": 44100,
  "title": "Track One"
}
```

Error `21` if the track is unknown.

#### `GetQueuedEntries`

`{"fields": [...]} → {"count_of_found_entries": int, "entries": [[…], …]}`

The play queue, same row format and fields as `GetPlaylistEntries`
(`queue_index` is the position in the queue).

#### `CreatePlaylist`

`{"title": string} → {"playlist_id": int}` — creates an empty playlist without
activating it. Error `30` on failure.

#### `PlaylistRename`

`{"playlist_id": int, "new_name": string} → {"success": true}` — error `20`
(unknown playlist), `29` (rename failed).

#### `PlaylistRemove`

`{"playlist_id": int} → {"success": true}` — closes and removes the playlist.
Error `20`, `31`.

### 7.3 Playback control

#### `Play`

`{"track_id": int} → {"playback_state": string, "playlist_id": int, "track_id": int}`

Starts the given track. The result describes the state **before** the switch
(the original plugin behaved this way and the app relies on the keys being
present). Error `21` for an unknown track.

#### `Pause`

`{} → {"playback_state": string}`

Toggles: playing → paused, paused → playing, stopped → starts the focused
track. Returns the state **before** the toggle.

#### `Stop`

`{} → {"playback_state": string}`

Stops playback (the app sends it on a long press of play/pause). Returns the
state **before** the stop.

#### `PlayNext`, `PlayPrevious`

`{} → {"playlist_id": int, "track_id": int}`

Switches to the next/previous track. When the player is stopped, only the
selection moves (wrapping around), exactly like the player's own buttons, and a
`control_panel_state_change` event is raised so the app shows the new
selection. The result is the state **before** the switch.

#### `Status`

Universal getter/setter for player properties. Numbering comes from the
AIMP 2/3 era `AIMP_STS_*` constants.

- read: `{"status_id": int} → {"value": int}`
- write: `{"status_id": int, "value": int} → {"value": int}` (the value after
  applying)

All values are integers; continuous properties are expressed as **0..100 %** of
the player's range. Unknown `status_id` → `-32602`.

| `status_id` | Property | Values |
|---|---|---|
| 1 | volume | 0..100 |
| 2 | balance | 0..100, 50 = center |
| 3 | speed | 0..100, piecewise linear: 0 → 0.5×, **50 → 1.0×**, 100 → 3.0× |
| 4, 37 | player state | 0 stopped, 1 paused, 2 playing (read-only) |
| 5 | mute | 0/1 |
| 6 | reverb | 0..100 |
| 7 | echo | 0..100 |
| 8 | chorus | 0..100 |
| 9 | flanger | 0..100 |
| 10 | equalizer enabled | 0/1 |
| 11–28 | equalizer bands 1–18 | 0..100, 50 = 0 dB, range ±15 dB |
| 29 | repeat track | 0/1 |
| 30 | stop after current track | 0/1 |
| 31 | position, seconds | read/write (seek) |
| 32 | length, seconds | read-only |
| 33 | repeat playlist | 0/1 |
| 34 | repeat single-file playlists | 0/1 |
| 35 | bitrate, kbps | read-only |
| 36 | sample rate, kHz | read-only |
| 38 | radio capture | 0/1 |
| 41 | shuffle | 0/1 |
| 45 | minimized to tray | 0/1 |
| 48 | true bass | 0..100 |
| 49 | enhancer (stereo base) | 0..100, 0 = 1.0 … 100 = 5.0 |
| 50 | tempo | 0..100, piecewise linear: 0 → 0.5×, **28 → 1.0×**, 100 → 3.0× |
| 51 | pitch | 0..100, 50 = 0 semitones, range ±10 |
| 52 | preamp | 0..100, 50 = 0 dB, range ±15 dB |

The odd pivots for speed (50) and tempo (28) are the "reset" values the app
sends; they map to 1.0× while the ends of the slider reach the real limits of
the player.

```json
// request
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "Status",
  "params": {
    "status_id": 1,
    "value": 65
  }
}
// response
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "value": 65
  }
}
```

#### `Equalizer`

`{"active"?: bool, "bands"?: [int × 18]} → {"active": bool, "bands": [int × 18]}`

Reads the equalizer; if `active` and/or `bands` are given they are applied
first. Bands use the same 0..100 scale as `Status` 11–28 (50 = 0 dB). `bands`
with a length other than 18 → `-32602`.

### 7.4 Tracks

#### `SetTrackRating`

`{"track_id": int, "rating": int} → {"rating": float}` — `rating` 0..5; the
result is the value after setting. Error `21`.

#### `SetTrackEnabled`

`{"track_id": int, "enabled": bool} → {"success": true}` — error `21`.

#### `EnqueueTrack`

`{"track_id": int, "insert_at_queue_beginning"?: bool} → null` — adds the track
to the play queue (at the end by default). Errors `21`, `18`.

#### `RemoveTrackFromPlayQueue`

`{"track_id": int} → null` — also `null` if the track was not queued. Errors
`21`, `19`.

#### `RemoveTrack`

`{"playlist_id": int, "track_id": int, "physically": bool} → {"success": true}`

Removes the entry from the playlist; with `"physically": true` the file is also
deleted from disk, which is allowed only if enabled in the plugin settings
(otherwise error `28`). Errors `21`, `28`.

#### `GetCover`

`{"track_id": int} → {"album_cover_uri": "album_covers_cache/cover_0_<track_id>_0x0_<n>.<ext>"}`

Returns a URI (relative to the server root) to fetch with `GET`, see
[9.1](#91-album-art). `<ext>` is `jpg`, `png` or `gif` according to the actual
image format; `<n>` changes when the image changes (cache key). Error `22` when
the track has no cover.

#### `Lyrics`

`{"track_id": int} → {"text": string}` — lyrics from the file tag, a sidecar
file or AIMP's lyrics providers; lines are separated by CRLF. Error `35` when
nothing is found, `21` for an unknown track.

### 7.5 Files

#### `GetFormats`

`{} → {"formats": ["mp3", "ogg", "flac", …]}` — extensions the player can play
(lower-case, without dots).

#### `BrowseFiles`

- `{}` → roots: `{"labels": ["", "Data", "Music"], "paths": ["C:\\", "D:\\"]}`
  (Windows drives with volume labels; `/` on Linux).
- `{"path": string}` → `{"files": [name, …], "folders": [name, …]}` — names
  only, sorted case-insensitively. Files are filtered to playable extensions
  (`GetFormats`) and exclude hidden/system files; all folders are listed.

Error `33` if the path cannot be read, or if file browsing is not allowed in
the plugin settings (it is disallowed by default).

#### `AddFiles`

`{"playlist_id": int, "files": [path, …]} → {"success": true}`

Appends files and/or folders to the playlist. Folders are expanded by the
player, which keeps only supported formats. Errors `20`, `27`.

#### `AddURLToPlaylist`

`{"playlist_id": int, "url": string} → null` — appends a stream URL. Errors
`20`, `27`.

### 7.6 Miscellaneous

#### `ShowMessage`

`{"message": string} → {"success": true}` — shows the text in the player's
notification area. The app sends `"<phone name> connected"` on connect.

#### `Scheduler`

Sleep timer.

- read: `{}`
- set: `{"action": string, "expiration_delay": number}` (seconds)
- cancel: `{"cancel": "true"}` (the string `"true"`; boolean `true` is accepted too)

`→ {"supported_actions": [string, …], "current_timer"?: {"actions": [string], "expires_in": int}}`

| Action | Effect when the timer fires |
|---|---|
| `pause_playback` | pauses if playing |
| `player_shutdown` | closes the player |
| `machine_shutdown` | shuts the computer down; the player shows its own 10‑second countdown dialog with a *Cancel* button |
| `machine_sleep` | suspends the computer (listed only when the OS supports it) |
| `machine_hibernate` | hibernates the computer (listed only when supported) |

```json
// set
{
  "action": "pause_playback",
  "expiration_delay": 900
}
// result
{
  "supported_actions": ["player_shutdown", "pause_playback", "machine_shutdown", "machine_sleep", "machine_hibernate"],
  "current_timer": {
    "actions": ["pause_playback"],
    "expires_in": 900
  }
}
```

Error `-1` when timer functions are disabled in the plugin settings; `-32602`
for an unknown action or a missing/non-positive delay. Changes are pushed
through the `timer_state_change` event.

---

## 8. Long polling: `SubscribeOnAIMPStateUpdateEvent`

`{"event": string} → <event payload>`

The request **does not return until the event occurs** (observed from 30 ms to
minutes). The client keeps one pending request per event type and re-subscribes
immediately after each response. Unknown event name → `-32602`.

| `event` | Payload |
|---|---|
| `control_panel_state_change` | the `GetPlayerControlPanelState` object — on play/pause/stop, track change, seek, volume, mute, repeat, shuffle, radio capture |
| `playlists_content_change` | `{"event": "playlists_changed", "playlists": [{"id": int, "crc32": int}, …]}` — all playlists; the client compares `crc32` values and reloads the changed ones |
| `queue_content_change` | `{"changed": true}` |
| `timer_state_change` | `{"active": false}` or `{"active": true, "actions": [string], "expires_in": int}` — on set, cancel and fire |

Position ticks (once a second while playing) are **not** events. If nothing
happens for 10 minutes the server answers with the current snapshot anyway, so
the client can refresh its connection; on server shutdown pending polls fail
with `-32000`.

```json
// request
{
  "jsonrpc": "2.0",
  "id": -4,
  "method": "SubscribeOnAIMPStateUpdateEvent",
  "params": {
    "event": "control_panel_state_change"
  }
}
// … minutes later, when the user presses Pause in the player …
{
  "jsonrpc": "2.0",
  "id": -4,
  "result": {
    "playback_state": "paused",
    "playlist_id": 191542976,
    "track_id": 1723812340,
    "track_length": 267,
    "track_position": 42,
    "volume": 80,
    "mute_mode_on": false,
    "repeat_mode_on": false,
    "shuffle_mode_on": false,
    "radio_capture_mode_on": false,
    "current_track_source_radio": false
  }
}
```

---

## 9. HTTP endpoints

All endpoints require the same Digest authentication as the RPC calls.

### 9.1 Album art

`GET /album_covers_cache/cover_0_<track_id>_<w>x<h>_<n>.<ext>`

Use the URI returned by `GetCover`. The size part is ignored — the original
image is always returned (`Content-Type: image/jpeg|png|gif`; other formats are
re-encoded to PNG). `404` for an unknown track or a track without cover.

### 9.2 Track download

`GET /downloadTrack/playlist_id/<playlist_id>/track_id/<track_id>`

Returns the audio file with `Content-Type` by extension (`audio/x-mp3`, …) and
`Content-Disposition: attachment; filename="<file name>"`. The file name is
**raw UTF‑8 inside the quotes**, without an RFC 5987 `filename*` — this is what
the original plugin sent and what the app's download manager understands (it
crashes on percent-encoded names). `playlist_id` is accepted but not needed.
For CUE entries and other container-backed tracks the container file is
returned. `404` for an unknown track or URL entries.

### 9.3 Track upload

`POST /uploadTrack/playlist_id/<playlist_id>` — `multipart/form-data`, one or
more file parts:

```
Content-Disposition: form-data; name="<file name>"; filename="<file name>"
Content-Type: application/octet-stream
```

Files are saved into the upload folder configured on the player and appended to
the playlist.

| Status | Meaning |
|---|---|
| `200` | saved and added |
| `400` | no file parts |
| `403` | uploading is disabled in the plugin settings |
| `404` | unknown playlist (checked before anything is written) |
| `500` | could not write the file or add it to the playlist |

Notes:

- Only the `filename` component is used (no directories); characters invalid
  for the file system become `_`; a clash gets a ` (2)`, ` (3)`… suffix.
- The app encodes part names in ISO‑8859‑1 and replaces every other character
  with `?` (e.g. `"?????.mp3"` for a Cyrillic name). When the name
  contains `?` the server renames the saved file to `<Artist> - <Title>.<ext>`
  from the tags; without tags the `?` become `_`.
- Request bodies up to 2 GB are accepted.

---

## 10. Session walkthrough

What the app does after the user taps a player:

1. `GetPlaylists` — list and checksums.
2. `GetQueuedEntries` — queue.
3. `GetPlayerControlPanelState` — current state.
4. `PluginCapabilities` — what the UI may offer.
5. `GetPlaylistEntryInfo` — details of the current track.
6. `ShowMessage` — `"<phone> connected"`.
7. Four `SubscribeOnAIMPStateUpdateEvent` calls (one per event type) that stay
   pending.
8. `Status 31` — position; afterwards `Status` is polled roughly once a second
   while the app is in the foreground (≈85 % of all traffic).
9. `GetPlaylistEntries` for every playlist (lazily, as the user opens them).

While running, user actions map 1:1 to the methods above; covers are fetched
with `GetCover` + `GET`, and track changes in the player arrive through the
pending long polls.
