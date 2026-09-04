# AIMP Remote Control web API

The API behind the web client in `wwwroot/`. Unlike the
[frozen protocol](remote-control-protocol.md) of the Android app it is not a
compatibility contract: it is versioned by path (`/api/v1`) and changes together
with the client that ships in the same package.

## Conventions

| | |
|---|---|
| Transport | JSON over HTTP under `/api/v1`, UTF-8, same port as everything else (3333) |
| Authentication | the same HTTP Digest as the frozen protocol; every method, `GET` included |
| Identifiers | a playlist `id` is AIMP's own playlist id (string), stable across player restarts |
| Field names | camelCase |
| Errors | HTTP status plus `{"error": {"code": string, "message": string}}`; `code` is stable, `message` is for humans and comes in the language of the player's interface (`Langs/*.lng`, section `[AIMPRemoteControlErrors]`, keyed by `code`) |
| Limits | request bodies above 16 MB are refused with `413` |

Error codes so far:

| Status | `code` | Meaning |
|---|---|---|
| `400` | `invalidJson` | the request body is not valid JSON |

## Playlists

### `GET /api/v1/playlists`

All loaded playlists in the player's order.

```json
[
  {
    "id": "{A1B2C3D4-...}",
    "name": "Music",
    "readOnly": false,
    "entryCount": 2
  }
]
```

## Events

### `GET /api/v1/events`

A [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream (`text/event-stream`). The server sends `retry: 3000` first, so a
browser `EventSource` reconnects three seconds after a drop, then one event per
change; the payload is a JSON object.

| `event` | When | `data` |
|---|---|---|
| `hello` | once, right after connecting | `{"pluginVersion": "1.3.1.0"}` — compare with the previous connection's value to learn that the plugin was updated while the page was open |
| `player` | playback state, track, position, volume, mute, repeat, shuffle, radio capture | `{}` |
| `playlists` | a playlist was added, removed, renamed or its content changed | `{}` |
| `queue` | the playback queue changed | `{}` |
| `timer` | the sleep timer was set, cancelled or fired | `{}` |

A comment line (`: ping`) goes out after 30 s without events; it keeps
intermediaries from closing an idle connection and lets the server notice a
client that went away. On player shutdown the stream ends.

Each open stream occupies one worker thread of the HTTP server, like the
long polls of the frozen protocol.
