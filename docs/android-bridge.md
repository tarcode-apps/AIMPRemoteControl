# Android bridge

The contract between the Android app and the web client it shows in its web view. The two are released apart: the client
comes with the plugin, from the player itself, and the app from a store. Either may be older than the other, so each
says what it can do and neither assumes more. [android-app-plan.md](android-app-plan.md) says what the app is and which
stage adds what to this contract.

## How the two meet

- The app gives the page an object, `window.aimpRemoteControlApp`, before any script of the page runs
  (`WebViewCompat.addWebMessageListener`). Only pages of the connected player's own origin get it, and the app hears
  only the page itself, not a frame within it.
- The object has `postMessage(text)`, which sends to the app, and `onmessage`, which the client sets to hear the app;
  the text of a message from the app is in `event.data`.
- In a browser there is no such object, and the client runs as it does there, with nothing of the app's. The app opens
  no player in a system web view older than 111, or one without the listener: it asks for the web view to be updated.
- The app opens the client of the plugin 3.0 and later only. The client of the plugins 2.0 knows nothing of the app and
  asks the player by itself, which in the web view has no login; the app tells such a player by the plugin's version
  before it opens the page, and says to update the plugin.
- A message is a JSON object as text, with a `type`. A side that gets a `type` it does not know leaves the message
  alone.

## The greeting

The client begins. Once for each page, as the page loads and whatever is on the screen, it sends:

```json
{ "type": "hello" }
```

The app answers with what it can be asked for:

```json
{ "type": "hello", "features": ["disconnect", "api"] }
```

- The client asks the app only for what `features` names, and shows nothing that needs a feature the app did not name. A
  feature is added to the app and to this document together; a name is never given another meaning.
- Until the answer comes the client has no features, and asks the player for nothing: the answer tells it how the player
  is reached.
- The app takes a page that has greeted it for the client. On the first screen of such a page Back leaves the app with
  the player connected, since the page has the button that disconnects; on any other page Back disconnects.
- A greeting is a new page: the app answers nothing the page before it asked.

## Messages

| From   | `type`       | Feature      | Fields                                    | What it does                                              |
| ------ | ------------ | ------------ | ----------------------------------------- | --------------------------------------------------------- |
| client | `hello`      |              |                                           | Asks who is there; sent once for each page                |
| app    | `hello`      |              | `features`: `string[]`                    | Names what the app can be asked for                       |
| client | `disconnect` | `disconnect` |                                           | The app leaves the player for its list of players         |
| client | `request`    | `api`        | `id`, `method`, `path`, `body`?, `file`?  | Asks the player's API through the app                     |
| app    | `response`   | `api`        | `id`, and the answer or `error`           | Answers a `request`                                       |
| client | `abort`      | `api`        | `id`                                      | The answer to that `request` is wanted no more            |
| client | `events`     | `api`        | `listen`: `boolean`                       | Begins, or ends, the telling of events and the connection |
| app    | `open`       | `api`        |                                           | The player's stream of events is open                     |
| app    | `event`      | `api`        | `name`, `data`                            | An event of the stream                                    |
| app    | `connection` | `api`        | `online`, `checking`, `closed`, `retryAt` | Whether the player is there                               |
| client | `retry`      | `api`        |                                           | The user asks for the player now                          |

### `disconnect`

The app keeps several players and is connected to one of them at a time; while it is, the client of that player is all
it shows. The client's card of the player, at the top of the drawer, has a button that disconnects, shown only where the
app named `disconnect`. On the message the app drops the page and shows its list of players, where the user connects to
this player again or to another.

### `api`

Where the app names `api`, the page reaches the player's API ([web-api.md](web-api.md)) through the app and never by
itself. The app holds the player's login and makes the requests under it; the web view has no login, and answers no
request for one. The pages themselves the web view loads from the player as before: they are public.

In the client the choice is made in one place, `app/_api/helpers/transport.ts`: `fetch` and `EventSource` in a browser,
the bridge in the app. Whatever reaches the API goes through it.

**A request.** `id` is a whole number the client chooses, new for each request. `method` is `GET`, `POST`, `PUT`,
`PATCH` or `DELETE`. `path` begins at the root and has its query with it: `/api/v1/player`. `body`, where there is one,
is JSON as text. `file: true` asks for the bytes of the answer and not its text: an image.

```json
{ "type": "request", "id": 7, "method": "PATCH", "path": "/api/v1/player", "body": "{\"volume\":0.5}" }
```

**Its answer** is the player's, whatever its status:

```json
{ "type": "response", "id": 7, "status": 200, "contentType": "application/json", "url": "/api/v1/player", "body": "{}" }
```

- `url` is the path the request ended at, after the player's redirects: an item's cover ends at the image by its bytes.
- The body is in `body` as text, or for a `file` in `base64`.
- Where there is no answer to pass on, the message has `error` and nothing of the answer: `network` (the player did not
  answer), `refused` (the app would not ask: not a path of the API, not a request), `busy` (the page waits for too many
  answers), `too long` (the answer is longer than the app passes on).
- After `abort` no answer comes.

**Events.** After `{"type":"events","listen":true}` the app tells the page of the one stream of events it keeps open to
the player: `open` whenever the stream opens, and each event with its `name` and its `data` as the player sent it, but
the pings. A page that begins to listen while the stream is open is told `open` at once, and the player's `hello` event
again. The app tells nothing else of what came before, so the client reads the state it shows as it begins to listen,
and again on every later `open`.

**The connection.** With the events comes `connection`, at once and whenever it changes: the fields of the client's
`connection.ts`, which the client takes as they are. `retryAt` is when the next attempt to open the stream starts, in
milliseconds of the device's clock, or `null`. The silence watchdog, the retries and the wait before a loss is told are
the app's (`PlayerConnection.kt`), by the rules the client's own stream follows in a browser (`browserTransport.ts`): a
change to either is a change to both. In one thing the app is stricter: it takes the player for found once the stream is
open and the player has told its state, which the app asks for as the stream opens; `open` is told as before. A request
that found no player, the app has seen itself; `retry` is the button of the client's banner.

**What the app does not do yet.** The page saves no file and sends none: both need the login. The client hides the
download of a track and the upload of files where the app names `api`, until the app names a feature for each.

## What the app takes from the page

The page comes from the player over plain HTTP, so anybody who can answer for the player's address in the network can
write it. The app takes it for that:

- A message is text of at most 1 048 576 characters. The app drops anything else unread: a longer text, bytes (an
  `ArrayBuffer`), text that is no JSON object with a `type`. The client sends no longer request, and answers it itself
  with the status `413`.
- A message asks the app to do something, and never carries what the app would trust: a feature is safe to give to any
  page of the player's address, or it is not added.
- A `request` reaches the player's API and nothing else: its `path` is taken for where it leads, and refused unless that
  is under `/api/` of the player's own address. Any version of the API passes, so that a client of a newer player needs
  no newer app. The stream of events, `/api/v1/events`, is the app's to open.
- The page costs the app a bounded amount: at most 64 requests wait for their answers, 16 of them with the player at a
  time, and an answer longer than 16 MB is not passed on.
- Nothing the app keeps goes to the page: not the login, not the other players. A page that asks the API through the app
  can do with the player what the user can, and no more.
- The web view shows the player's pages only. A link to another address opens in the browser, and only when the user
  followed it; whatever else the page asks another address for is not loaded.
- The web view answers no request for a login. It is told who asks and no more, not how and not at which port, so an
  answer would give the password in clear to whoever asks in the player's name.
- The app's own requests are signed for the player's address alone, wherever a redirect leads.

## Where it is

- The app: `android/app/src/main/kotlin/com/tarasovlabs/aimpremotecontrol/bridge/`. `BridgeSession.kt` is the bridge,
  and `WebBridge.kt` joins it to the web view.
- The client: `web-client/app/_utils/androidApp.ts` (the greeting, the messages) and
  `web-client/app/_api/helpers/appTransport.ts` (the API).
- The client's side is tested without the app, by a stand-in for `window.aimpRemoteControlApp`:
  `web-client/e2e/ui/android-app.spec.ts`. The app's side is tested without a web view: `BridgeSessionTest.kt`.

## To come

Downloads and uploads, each with a feature and its messages added here: the plan says in which stage.
