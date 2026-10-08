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
| `404` | `coverNotFound` | the item has no cover, the `key` is not the item's current one, or the image named by this hash is no longer known |
| `409` | `queueChanged` | the `revision` in the request is not the playback queue's current one |

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
    "showThumbnails": true,
    "grouping": { "enabled": true, "template": "%Album", "autoMerge": false }
  }
]
```

`duration` is in seconds, `size` in bytes. `revision` is a change counter kept
by the plugin: it starts at 1 when the playlist is loaded, grows on every
change of its name, content, tags, statistics, read-only flag, track switches
or view and grouping settings, and is
not stable across player restarts. The bookkeeping the player does when it
starts a track is not counted; a change of content, tags or ratings counts
within a second of being made. Compare it with the value in the
[`playlists` event](#get-apiv1events) to learn which playlists to reload.
`showNumbers`, `absoluteNumbers`, `showDuration`, `showSecondLine` and
`showThumbnails` are the playlist's view settings in the player; the client lays
out item rows by them. The player does not expose its thumbnail setting yet, so
`showThumbnails` follows `showSecondLine`, as the player itself shows thumbnails
only with the second line.
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
| `search` | | case-insensitive substring over title, artist, album, genre and folder name; `total` and `offset` then count matches, and the response adds `duration` and `size` of every match. Surrounding whitespace is ignored, a blank value means no search |

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
      "isUrl": false,
      "cover": "7068c7442182d15a",
      "fileUri": "C:\\Music\\Artist A\\Track One.mp3"
    }
  ]
}
```

`displayText` and `secondLine` are the two lines the player itself shows for
the item, formatted by the playlist's own templates; `secondLine` is empty
when the playlist hides its second line. `duration` is in seconds, `size` in bytes,
`rating` is `0..5`, `enabled` is the check box in front of the track, `isUrl` marks streams. `cover` is the
key the item's [cover URL](#get-apiv1playlistsiditemsindexcoverkeysize) takes: it
names the file, so it only changes when the file is replaced. The client shows the covers of
the playlists whose `showThumbnails` is on. `fileUri` is the track's URI as the
player stores it: a path, an URL, or a part of a container such as a CUE sheet;
it is the one stable name of a track across playlist changes, and is compared
byte for byte (the player runs on case-sensitive file systems too).
Every page is read from the player at request time, nothing is cached in the
plugin; a search is one pass over the whole playlist per page.

Errors: `404 playlistNotFound`, `400 invalidQuery`.

### `POST /api/v1/playlists/{id}/items/details`

The selected items with the tag fields a client keeps for lists of its own,
such as favorites. The body names the items as
[`POST /api/v1/queue/items`](#post-apiv1queueitems) does, `playlistId` aside,
plus an optional `revision`.

```json
{
  "items": [
    {
      "index": 12,
      "displayText": "Artist A - Track One",
      "secondLine": "MP3 :: 44 kHz :: 320 kbps :: Stereo :: 10,16 MB",
      "duration": 266.4,
      "size": 10655744,
      "rating": 4,
      "enabled": true,
      "isUrl": false,
      "cover": "7068c7442182d15a",
      "fileUri": "C:\\Music\\Artist A\\Track One.mp3",
      "artist": "Artist A",
      "album": "Album",
      "genre": "Rock",
      "year": "2008",
      "folder": "Artist A"
    }
  ]
}
```

The items are [playlist items](#get-apiv1playlistsiditems) with the tags as
written, empty when missing; `secondLine` follows the playlist's template
whether or not the playlist shows it, `folder` is the name of the file's
folder.

Errors: `400 invalidBody`, `404 playlistNotFound`, `404 itemNotFound`,
`409 playlistChanged`.

### `POST /api/v1/playlists/locate`

Finds remembered files in the playlists they were remembered from:

```json
{"items": [{"fileUri": "C:\\Music\\Artist A\\Track One.mp3", "playlistId": "{A1B2C3D4-...}"}]}
```

```json
{
  "found": [
    {
      "fileUri": "C:\\Music\\Artist A\\Track One.mp3",
      "playlistId": "{A1B2C3D4-...}",
      "revision": 7,
      "index": 12,
      "displayText": "Artist A - Track One",
      "secondLine": "MP3 :: 44 kHz :: 320 kbps :: Stereo :: 10,16 MB",
      "duration": 266.4,
      "size": 10655744,
      "rating": 4,
      "enabled": true,
      "isUrl": false,
      "cover": "7068c7442182d15a"
    }
  ]
}
```

Each file is looked for in its own playlist only, by comparing the URI byte for
byte, and the first item that matches is returned as a [playlist item](#get-apiv1playlistsiditems)
with the playlist's `revision` its `index` belongs to. A file that is not in
its playlist, or whose playlist is not loaded, is simply absent from `found`.
One pass over each named playlist, reading only the URIs.

Errors: `400 invalidBody`.

### `GET /api/v1/playlists/{id}/groups`

The playlist's groups as the player shows them, in order. Empty when the
playlist is not grouped.

With the same `search` parameter as `items`, the groups describe the matches
only: `count`, `duration`, `size` and `firstPosition` count matching items, positions
run through the matches like `offset` does, and groups without matches are left
out. `index` stays the group's real index, so it can still be collapsed.

```json
{
  "revision": 7,
  "groups": [
    { "index": 0, "name": "Album X", "count": 12, "duration": 2870.4, "size": 114819072, "expanded": true, "firstPosition": 0 },
    { "index": 1, "name": "Album Y", "count": 9, "duration": 2011.0, "size": 80445440, "expanded": false, "firstPosition": 12 }
  ]
}
```

Groups are contiguous runs of the playlist: `firstPosition` is the index of the
group's first item and the group covers the next `count` items, `size` being
their total in bytes. `expanded` is
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

## Search

### `GET /api/v1/search`

The extended search: one text over every loaded playlist, or over the named ones.
The matches come in playlist order, the playlists in the player's order, and
are paged as a whole.

| Query | Default | |
|---|---|---|
| `search` | | required: the case-insensitive substring to look for, surrounding whitespace ignored |
| `fields` | all | comma-separated, which texts to look through: `title` (the tag title, or the file name without one), `artist`, `album`, `genre`, `file` (the whole file path or URL) |
| `playlists` | all | comma-separated playlist ids: only these, in the player's order |
| `offset` | `0` | index of the first match to return |
| `limit` | `200` | page size, `1..500` |

```json
{
  "total": 37,
  "duration": 9124.6,
  "size": 365248512,
  "items": [
    {
      "playlistId": "{A1B2C3D4-...}",
      "revision": 7,
      "index": 12,
      "displayText": "Artist A - Track One",
      "secondLine": "MP3 :: 44 kHz :: 320 kbps :: Stereo :: 10,16 MB",
      "duration": 266.4,
      "size": 10655744,
      "rating": 4,
      "enabled": true,
      "isUrl": false,
      "cover": "7068c7442182d15a",
      "fileUri": "C:\\Music\\Artist A\\Track One.mp3"
    }
  ],
  "playlists": [
    { "id": "{A1B2C3D4-...}", "revision": 7, "count": 25, "duration": 6230.1, "size": 249233408 },
    { "id": "{B2C3D4E5-...}", "revision": 3, "count": 12, "duration": 2894.5, "size": 116015104 }
  ]
}
```

`total`, `duration` and `size` describe every match in the scope, not the
page. The items are [playlist items](#get-apiv1playlistsiditems) with the
`playlistId` and the playlist `revision` the `index` belongs to; `secondLine`
follows the playlist's template whether or not the playlist shows it.
`playlists` lists the playlists with matches, in order, with their counts and
totals, so that a client can lay the whole result out in groups and sum a whole
group before it has loaded the pages. Every page is one pass over the scope.

Errors: `400 invalidQuery` (no text, an unknown field name), `404 playlistNotFound`
(one of `playlists` is not loaded).

## Queue

The playback queue holds playlist items that the player plays next, before it
goes on with the playing playlist. A track may be queued any number of times,
so an entry is named by its `position`; `playlistId` and `index` say which
track it is, `index` being valid for the playlist's current revision.

### `GET /api/v1/queue`

```json
{
  "revision": 12,
  "suspended": false,
  "items": [
    {
      "position": 0,
      "playlistId": "{A1B2C3D4-...}",
      "index": 17,
      "displayText": "Artist - Title",
      "secondLine": "MP3 :: 44 kHz :: 320 kbps :: Stereo",
      "duration": 237.4,
      "rating": 0,
      "enabled": true,
      "isUrl": false,
      "cover": "3f9a1c2e5b7d8e01",
      "fileUri": "C:\\Music\\Artist\\Title.mp3"
    }
  ]
}
```

The whole queue, in playing order. `revision` is a change counter of the
queue, kept while the player runs; positions in a request are only meaningful
for one revision, so the requests below take it the way the playlist requests
take theirs. `suspended` is the player's "suspend the queue" switch: the queue
is kept but not played from. The items carry the same fields as
[playlist items](#get-apiv1playlistsiditems); `secondLine` follows the
playlist's template whether or not the playlist shows it, and `cover` works
with the item's [cover URL](#get-apiv1playlistsiditemsindexcoverkeysize).

### `POST /api/v1/queue/items`

Adds items of one playlist to the queue, in playlist order, at the end or,
with `atBeginning`, at the beginning. The items are either named by index or
chosen by search:

```json
{"playlistId": "{A1B2C3D4-...}", "indexes": [3, 4, 9], "atBeginning": false, "revision": 7}
{"playlistId": "{A1B2C3D4-...}", "search": "beatles", "except": [12], "revision": 7}
```

`search` selects every item the search would list (an empty string is the
whole playlist) but the indexes in `except`; a client that selected everything
in a long result does not have to send the indexes. With `fields`, a non-empty
array of the names [`GET /api/v1/search`](#get-apiv1search) takes, the
selection covers what that search lists in the playlist instead of what the
playlist's own search does. `groups`, indexes of the playlist's groups as
[`GET /api/v1/playlists/{id}/groups`](#get-apiv1playlistsidgroups) gives them,
keeps the search to those groups, so a client can select whole groups without
loading their items; `indexes` next to `search` adds items besides the matches.
Either way the items come in playlist order:

```json
{"playlistId": "{A1B2C3D4-...}", "search": "", "groups": [0, 2], "except": [5], "indexes": [6], "revision": 7}
```

`except`, `groups` and `fields` without `search` are refused. `revision` is
the playlist's and optional, as in the group requests. The response is an empty
object.

Errors: `400 invalidBody`, `404 playlistNotFound`, `404 itemNotFound` (an index or
a group outside the playlist), `409 playlistChanged`, `500 playlistUpdateFailed`.

### `POST /api/v1/queue/remove`

```json
{"positions": [2, 5], "revision": 12}
```

Takes the entries at `positions` out of the queue; other entries of the same
tracks stay. Errors: `400 invalidBody`, `404 itemNotFound`,
`409 queueChanged`, `500 playlistUpdateFailed`.

### `POST /api/v1/queue/move`

```json
{"positions": [5], "target": 0, "revision": 12}
```

Moves the entries at `positions` so that the first of them lands at `target`
in the resulting queue; they keep their relative order. Errors:
`400 invalidBody`, `404 itemNotFound`, `409 queueChanged`,
`500 playlistUpdateFailed`.

### `DELETE /api/v1/queue`

Empties the queue. The body is optional and may carry `revision`. Errors:
`400 invalidBody`, `409 queueChanged`, `500 playlistUpdateFailed`.

### `PATCH /api/v1/queue`

```json
{"suspended": true}
```

Errors: `400 invalidBody`, `500 playlistUpdateFailed`.

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
    "isUrl": false,
    "coverHash": "b34839fba2927a883f861e5460f8698d",
    "fileUri": "C:\\Music\\Artist A\\Track One.mp3"
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
now, not the station itself. `fileUri` is the item's URI as in the
[playlist items](#get-apiv1playlistsiditems). `coverHash` names the
track's cover for [`GET /api/v1/covers/{hash}`](#get-apiv1covershashsize), which
the client fetches directly; it is empty without a cover, and the same for every
track that shares the image. The plugin looks the cover up when it builds the
state, once per track, as the player's own window does.

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

## Covers

A cover is served by the hash of its bytes, so that the tracks of an album,
which mostly share one image, share one download and one entry in the browser's
cache. The playing track's hash comes with the [player state](#get-apiv1player);
an item's own URL only redirects to the hash. Both URLs take the same `size`.

| Query | Default | |
|---|---|---|
| `size` | | the longer side in pixels; the server only scales down, so an image that already fits is served as it is. Without it the image is the copy the player holds, which the player itself has scaled down to its own limit. `original` is the image as found in the tags or the folder, read from the file on every request, for saving it. The web client asks for `64`, `128`, `256` or `512`, so that one image serves the screens of one density |

### `GET /api/v1/playlists/{id}/items/{index}/cover?key=…&size=…`

Looks the cover of one item up as the player's own window does: in the tags,
in the folder and, when the player's settings allow it, on the internet. `key`
is the item's `cover` value; it names the file in the URL and is checked against
the item, so that an index that has moved does not serve another item's cover.

The response is a `302` redirect to `GET /api/v1/covers/{hash}` with the same
`size`, sent with `Cache-Control: no-store`: the redirect is asked for on every
show, which is cheap, while the image it leads to stays in the browser's cache.
A missing cover and a `key` the item no longer has are a `404 coverNotFound`,
not cached either: a cover may be written into the tags at any time, and the
plugin reads the file again after that.

Errors: `400 invalidQuery`, `404 playlistNotFound`, `404 itemNotFound`,
`404 coverNotFound`.

### `GET /api/v1/covers/{hash}?size=…`

The image named by the hash of its bytes, scaled to `size`. The hash is that of
the player's copy whatever the `size`, the original included. JPEG stays JPEG and
PNG stays PNG; the bytes never change under one hash, so the image is sent with
`Cache-Control: private, max-age=31536000, immutable`.

The plugin keeps no copy of the images: it remembers the last few places each
hash was seen, playlist items and files, and looks the cover up there again,
since the player finds some covers only for an item, by artist and album in its
own cache. After a restart it remembers nothing until the items are asked
again, which the uncached redirect makes certain; the playing track's cover is
found whether or not it was asked for. A hash the
plugin does not know, or whose cover changed since, is a `404 coverNotFound`
with `Cache-Control: no-store`.

Errors: `400 invalidQuery`, `404 coverNotFound`.

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
| `queue` | an entry was added, removed or moved, the player took the next track out, or the queue was suspended or resumed | `{"revision": 12, "count": 3, "suspended": false}` — enough for a badge; the list itself is [`GET /api/v1/queue`](#get-apiv1queue) |
| `timer` | the sleep timer was set, cancelled or fired | `{}` |

A track switch raises several player changes within a few milliseconds, with
a stopped player in between; the stream waits for a 100 ms lull and sends one
`player` event with the state after the burst.

A comment line (`: ping`) goes out after 30 s without events; it keeps
intermediaries from closing an idle connection and lets the server notice a
client that went away. On player shutdown the stream ends.

Each open stream occupies one worker thread of the HTTP server, like the
long polls of the frozen protocol.
