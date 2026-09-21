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
| `400` | `invalidQuery` | a query parameter is missing, malformed or out of range |
| `400` | `invalidBody` | the request body is not the expected object |
| `404` | `playlistNotFound` | no loaded playlist has this `id` |
| `404` | `groupNotFound` | the playlist has no group with this index |
| `409` | `playlistChanged` | the `revision` in the request is not the playlist's current one |
| `403` | `playlistReadOnly` | the playlist is read-only in the player, so it cannot be sorted or reordered |
| `404` | `itemNotFound` | an item index in the request is outside the playlist |
| `500` | `playlistUpdateFailed` | the player refused the change |
| `500` | `playerCommandFailed` | the player refused a playback command or setting |

## Playlists

### `GET /api/v1/playlists`

All loaded playlists in the player's order.

```json
[
  {
    "id": "{A1B2C3D4-...}",
    "name": "Music",
    "readOnly": false,
    "itemCount": 2,
    "duration": 428.3,
    "size": 20512384,
    "revision": 7,
    "showNumbers": true,
    "absoluteNumbers": false,
    "showDuration": true,
    "showSecondLine": true,
    "grouping": { "enabled": true, "template": "%Album", "autoMerge": false }
  }
]
```

`duration` is in seconds, `size` in bytes. `revision` is a change counter kept
by the plugin: it starts at 1 when the playlist is loaded, grows on every
change of its name, content, tags, statistics, read-only flag, track switches
or view and grouping settings, and is
not stable across player restarts. Compare it with the value in the
[`playlists` event](#get-apiv1events) to learn which playlists to reload.
`showNumbers`, `absoluteNumbers`, `showDuration` and `showSecondLine` are the
playlist's view settings in the player; the client lays out item rows by them.
With `absoluteNumbers` off, numbering restarts in every group. `grouping` is
the playlist's own grouping: whether it is on, the template that names the
groups, and whether same-named groups are merged. Items are always returned in
the player's order; sorting and grouping happen in the player itself, not in
the API.

### `GET /api/v1/playlists/{id}/items`

A page of the playlist's items. Items are addressed by their index in the
playlist: AIMP has no stable track ids, so the index is what actions take, and
it is only valid for the `revision` the page was read at.

| Query | Default | |
|---|---|---|
| `offset` | `0` | index of the first item to return, in the view |
| `limit` | `200` | page size, `1..500` |
| `search` | | case-insensitive substring over title, artist, album, genre and folder name; `total` and `offset` then count matches. Surrounding whitespace is ignored, a blank value means no search |

```json
{
  "total": 15930,
  "revision": 7,
  "offset": 0,
  "items": [
    {
      "index": 0,
      "displayText": "Artist A - Track One",
      "secondLine": "MP3 :: 44 kHz :: 320 kbps :: Stereo :: 10,16 MB",
      "duration": 266.4,
      "rating": 4,
      "enabled": true,
      "isUrl": false
    }
  ]
}
```

`displayText` and `secondLine` are the two lines the player itself shows for
the item, formatted by the playlist's own templates; `secondLine` is empty
when the playlist hides its second line. `duration` is in seconds, `rating` is `0..5`,
`enabled` is the check box in front of the track, `isUrl` marks streams.
Every page is read from the player at request time, nothing is cached in the
plugin; a search is one pass over the whole playlist per page.

Errors: `404 playlistNotFound`, `400 invalidQuery`.

### `GET /api/v1/playlists/{id}/groups`

The playlist's groups as the player shows them, in order. Empty when the
playlist is not grouped.

With the same `search` parameter as `items`, the groups describe the matches
only: `count`, `duration` and `firstPosition` count matching items, positions
run through the matches like `offset` does, and groups without matches are left
out. `index` stays the group's real index, so it can still be collapsed.

```json
{
  "revision": 7,
  "groups": [
    { "index": 0, "name": "Album X", "count": 12, "duration": 2870.4, "expanded": true, "firstPosition": 0 },
    { "index": 1, "name": "Album Y", "count": 9, "duration": 2011.0, "expanded": false, "firstPosition": 12 }
  ]
}
```

Groups are contiguous runs of the playlist: `firstPosition` is the index of the
group's first item and the group covers the next `count` items. `expanded` is
the player's own collapsed state. `name` is what the player shows: with the
`%FileDir` grouping template that is the folder name alone, not the full path.

Errors: `404 playlistNotFound`.

### `PATCH /api/v1/playlists/{id}/groups/{index}`

Collapses or expands one group in the player; the change shows in the player's
window and comes back through the `playlists` event like any other change.

```json
{ "expanded": false, "revision": 7 }
```

`revision` is optional: when given and different from the playlist's current
revision the request is refused with `409 playlistChanged`, because group
indexes are only meaningful within one revision. The response is an empty
object.

Errors: `400 invalidBody`, `404 playlistNotFound`, `404 groupNotFound`,
`409 playlistChanged`.

### `PATCH /api/v1/playlists/{id}/groups`

The same body applied to every group of the playlist at once, for "collapse
all" and "expand all".

Errors: `400 invalidBody`, `404 playlistNotFound`, `409 playlistChanged`.

### `POST /api/v1/playlists/{id}/sort`

Sorts the playlist in the player. `by` names the order, `descending` (optional,
default `false`) inverts it after sorting and only makes sense for the orders
by a field: `title`, `fileName`, `duration`, `artist` and `template`. With
`template` the body also carries the `template` itself, a file info formatter
template such as `%Album %TrackNumber`, which the player evaluates for every
item. `inverse` reverses the current order; `random`, `randomGroups`,
`randomGroupItems` and `randomAll` shuffle the items, the groups, the items
inside each group, or both.

```json
{ "by": "template", "template": "%Year %Album", "descending": true, "revision": 7 }
```

`revision` is optional and works as in the group requests. The response is an
empty object; the new order comes back through the `playlists` event.

Errors: `400 invalidBody`, `403 playlistReadOnly`, `404 playlistNotFound`,
`409 playlistChanged`, `500 playlistUpdateFailed`.

### `POST /api/v1/playlists/{id}/items/move`

Moves items to a new place in the playlist. `indexes` are the items to move,
in any order; they keep their playlist order relative to each other. `target`
is the index the first of them has once they are moved, counted in the
resulting playlist, so it ranges from `0` to the item count minus the number
of moved items.

```json
{ "indexes": [12, 13], "target": 40, "revision": 7 }
```

Moving items across group boundaries is allowed; the player splits or merges
groups as its grouping settings dictate. `revision` is optional and works as in
the group requests. The response is an empty object.

Errors: `400 invalidBody`, `403 playlistReadOnly`, `404 playlistNotFound`,
`404 itemNotFound`, `409 playlistChanged`, `500 playlistUpdateFailed`.

## Player

### `GET /api/v1/player`

The player's state at request time.

```json
{
  "state": "playing",
  "position": 83.2,
  "duration": 266.4,
  "volume": 0.75,
  "mute": false,
  "repeat": "off",
  "shuffle": true,
  "radioCapture": false,
  "track": {
    "playlistId": "{A1B2C3D4-...}",
    "playlistRevision": 7,
    "index": 12,
    "trackNumber": "3",
    "title": "Track One",
    "artist": "Artist A",
    "album": "Album X",
    "isUrl": false
  }
}
```

`state` is `playing`, `paused` or `stopped`. `position` and `duration` are in
seconds, `volume` is `0..1`. `repeat` is `off`, `playlist` (the player's
"repeat playlist" action at the end of the playlist) or `track`. `trackNumber`
is the tag as written, `"3"` or `"3/12"`, empty when there is none. `track` is the item the player is playing or
paused on, `null` when stopped: like the player's own window, a stopped player
shows nothing, even though it remembers what to restart. `index` is the item's
index in its playlist and is only valid for `playlistRevision`; when that
playlist changes, a new `player` event carries the current index. For a
stream, `title`, `artist` and `album` describe what the station is playing
now, not the station itself.

The API sends nothing while the position merely advances: the client keeps
time itself from the moment it received the state and reads it again when it
comes back to the foreground. A seek, a track switch and every other change
come through the [`player` event](#get-apiv1events).

### `POST /api/v1/player/play`

With a body, plays one item:

```json
{ "playlistId": "{A1B2C3D4-...}", "index": 12, "revision": 7 }
```

`revision` is optional and works as in the group requests. Without a body the
request does what the player's own play button does: resumes a paused track,
and after a stop restarts the track the player last played. The response is an
empty object.

Errors: `400 invalidBody`, `404 playlistNotFound`, `404 itemNotFound`,
`409 playlistChanged`, `500 playlistUpdateFailed`, `500 playerCommandFailed`.

### `POST /api/v1/player/pause`, `.../stop`, `.../next`, `.../previous`

The player's own commands, with no body. `pause` toggles the pause like the
player's button, so it resumes a paused track. A command that has nothing to
do, such as `pause` while stopped, succeeds and changes nothing. The response
is an empty object.

Errors: `500 playerCommandFailed`.

### `PATCH /api/v1/player`

Changes any of the settings below; the others stay as they are. An empty body
is refused.

```json
{ "position": 120.5, "volume": 0.5, "mute": false, "repeat": "playlist", "shuffle": false }
```

`position` is in seconds and applies to the playing track, `volume` is
`0..1`, `repeat` is `off`, `playlist` or `track`; leaving `playlist` restores
the player's default action at the end of the playlist (jump to the next one)
unless it is set to do nothing. The response is an empty object.

Errors: `400 invalidBody`, `500 playerCommandFailed`.

## Events

### `GET /api/v1/events`

A [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream (`text/event-stream`). The server sends `retry: 3000` first, so a
browser `EventSource` reconnects three seconds after a drop, then one event per
change; the payload is a JSON object.

| `event` | When | `data` |
|---|---|---|
| `hello` | once, right after connecting | `{"pluginVersion": "1.3.1.0"}` — compare with the previous connection's value to learn that the plugin was updated while the page was open |
| `player` | playback state, track, a seek, volume, mute, repeat, shuffle, radio capture, or a change of the playing playlist that may have moved the track's index | the same object as [`GET /api/v1/player`](#get-apiv1player) |
| `playlists` | a playlist was added, removed, renamed or its content changed | `{"playlists": [{"id": "{A1B2C3D4-...}", "revision": 7}, …]}` — every loaded playlist with its current revision |
| `queue` | the playback queue changed | `{}` |
| `timer` | the sleep timer was set, cancelled or fired | `{}` |

A track switch raises several player changes within a few milliseconds, with
a stopped player in between; the stream waits for a 100 ms lull and sends one
`player` event with the state after the burst.

A comment line (`: ping`) goes out after 30 s without events; it keeps
intermediaries from closing an idle connection and lets the server notice a
client that went away. On player shutdown the stream ends.

Each open stream occupies one worker thread of the HTTP server, like the
long polls of the frozen protocol.
