# Android app plan

A new Android app for AIMP Remote Control: a native shell around the web client, with what only a native app can do. It
talks to the player over `/api/v1` ([web-api.md](web-api.md)), never over the frozen `/RPC_JSON`, which stays for the
old Android app (v2.0.31). This is the agreed plan, decided 2026-11; [Stages](#stages) says what is built and what comes
next.

## Features

- A list of players, added by hand or found on the local network.
- Scanning the local network for players.
- Login and password per player, which move to a new device with the rest.
- A notification with the playing track and controls, also on the lock screen, watches and in the car.
- Lowering the volume of the players or pausing them while a call rings or goes on, set per player.
- The phone's volume rocker sets the player's volume.
- The web client, shown full screen.

## Architecture

Three layers in one app:

- **Native shell** — Kotlin and Jetpack Compose, one Activity: players, scanning, login, settings.
- **Media session service** — a Media3 `MediaSessionService` over the app's one connection to the chosen player. Its
  player is a `SimpleBasePlayer` facade over HTTP calls with a remote `DeviceInfo` (`PLAYBACK_TYPE_REMOTE`, 0..100): it
  plays no audio and takes no audio focus. The system builds the notification, lock screen and headset controls from it
  and routes the volume rocker to it.
- **Web client** — a `WebView` that loads the client from the player itself (`http://<ip>:3333/`), so the client always
  matches the plugin. A bridge over `WebViewCompat.addWebMessageListener` connects it to the shell, and the client
  reaches the player's API through it: the app is the only part that talks to the player under its login.

App-wide wiring is a plain container object created in `Application` (players store, the connected player with its
connection); no DI framework. The HTTP client is one for the process, kept by `network/`.

### The app of the connected player

Once a player is connected, the app behaves as that player's own app:

- Opening the app shows the player's web client at once: no list of players and no sign of connecting.
- Back on the client's first screen leaves the app for the launcher and keeps the player connected. The app sends its
  task to the back itself and does not finish the Activity, so the page is still there on return. Left to the system,
  that would hold from Android 12 on and only for an Activity the launcher started.
- One player is connected at a time, and the list of players is there only while none is. The way to it is to
  disconnect: a button in the player's card that the web client shows only in the app (over the bridge, see
  [android-bridge.md](android-bridge.md)).
- Which player is connected is kept by the app's container, never by a screen: the service, the bridge and the Activity
  read it from one place. An Activity restored after the system killed the process goes on with its player.
- Where that button is missing, the app disconnects by itself. A page that does not load disconnects the player, and the
  list says of it what it says after a connection that got no answer. On a page that is not the client (an older
  plugin's), Back disconnects.
- The connection is what the media notification stands for. With no connected player the app starts with the list, and
  connects the player marked for it on a cold start.

How long a paused player stays connected in the background is settled with the service, on a device: the system stops a
service that is not in the foreground, and Media3 leaves the foreground on pause.

### Where the code lives

| Package      | What                                                                                                 | Used by                                  |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `network/`   | The HTTP client (OkHttp) with a Digest session per player; the reader of an event stream             | everything below                         |
| `player/`    | `PlayerConnection` (stream and status), `ConnectedPlayer`, `PlayerApi` (commands), the state's types | the service, the bridge, calls           |
| `playback/`  | `PlaybackService` with its `SimpleBasePlayer`, the cover loader                                      | the system; the Activity by a controller |
| `bridge/`    | The web view's bridge: the client's requests, events, connection status, downloads, uploads          | the web client                           |
| `calls/`     | The call receiver, the actions, the record of what was changed                                       | runs without the rest of the app         |
| `transfers/` | Background jobs of downloads and uploads                                                             | the bridge                               |

Three rules keep the code where it is first put:

- **Commands to a player are in `PlayerApi` only,** and one is made for any kept player with no connection to it: the
  calls reach players the app is not connected to, with the app closed. The requests of the web client are not the app's
  commands: the bridge passes them on as they are.
- **`PlayerConnection` gives each event twice:** as it came (a name and a text) for the bridge, and read into the
  player's state for the service. Its status has the fields of the web client's `connection.ts`, so that the bridge
  passes it on as it is. Its rules — the retries, the silence watchdog, the wait before a loss is told — are those of
  the client's own stream in a browser (`browserTransport.ts`), and a change to either is a change to both.
- **The connection belongs to `ConnectedPlayer`,** in the app's container: made when a player is connected, closed when
  it is disconnected, and everything that talks to the connected player does so through it. The service does not own it;
  it keeps the app in the foreground, without which the system cuts the app's network (seen on Android 17: the stream's
  socket is aborted within seconds of the app leaving the screen, and comes back on return).

### Network

- **Cleartext HTTP** to the local network is allowed by a `network_security_config`; the player serves no HTTPS.
- **Wi-Fi without internet:** Android moves traffic to mobile data when Wi-Fi has no internet, which loses the player.
  The process is bound to the Wi-Fi network (`ConnectivityManager.bindProcessToNetwork`), the `WebView` included.
- **Digest:** OkHttp has no Digest of its own, and the app signs requests itself (the probe showed it is enough): one
  session per player with `nonce`, `cnonce`, an atomic `nc`, a retry on `stale=true`. The server answers a reused `nc`
  with `stale=true` (see [remote-control-protocol.md](remote-control-protocol.md)), so parallel requests share one
  counter.
- **Local network permission:** targeting Android 17, the app asks for `ACCESS_LOCAL_NETWORK` at run time before it
  reaches a player (see [android-probe.md](android-probe.md)).

### The API, through the app

In the app the web client reaches the player's API through the bridge and never by itself
([android-bridge.md](android-bridge.md) has the messages):

- `web-client/app/_api/helpers/transport.ts` is the one way to the API, made twice: with `fetch` and `EventSource` in a
  browser, with the bridge in the app. Requests, images and the stream of events all go through it, and it keeps
  `connection.ts` told.
- The app makes the client's requests with its own HTTP client, under the player's login, and answers with what the
  player said. It makes no request that leaves `/api/` of the player's address: any version of the API, so that a client
  of a newer player needs no newer app.
- The app keeps the one stream of events and tells the page of it: each event with its name and data, and `open`
  whenever the stream opens, on which the client reads its state anew. A page that begins to listen while the stream is
  open is told so at once.
- The connection state is the app's too: the banner, paused queries and blocked navigation of the client work unchanged,
  fed by the app. The silence watchdog and the retries are in `PlayerConnection`.
- Images the player lets be kept (the covers, which it names by their bytes) are kept by the app's HTTP cache, which the
  notification's covers share.

### Authentication in the web view

There is none. The web view loads the player's pages, which are public, and has no login: `onReceivedHttpAuthRequest`
cancels whatever asks. The handler is told the host and the realm of a challenge, not its scheme nor the port, so it
cannot tell the player's `Digest` from a `Basic` challenge of whoever answers for the player's address, and an answer
would give the password in clear (found on the emulator). A player that takes the kept login no more is found by the
app's own requests and its stream; the app then disconnects and asks for the login.

The web view shows the player's pages only: a link that leads elsewhere opens in the browser, and the page gets nothing
it asks another address for.

### Downloads

- The system `DownloadManager` cannot answer Digest, and a pre-signed header breaks on resume (the server refuses a
  reused `nc`). Downloads are native: OkHttp with the Digest client, `Range` to resume, written to
  `MediaStore.Downloads` (no storage permission), progress in a notification.
- The page has no login to save a file with, so the client asks the app over the bridge: `download` with the path of the
  file. Until the app names the feature the client offers no download in the app.
- In the background: a user-initiated data transfer job (Android 14+), a WorkManager worker in foreground mode on
  Android 8–13. A plain coroutine dies with the process.

### Uploads

- The page has no login to send a file with, and a file of gigabytes does not go through the bridge, so the app sends:
  the client asks over the bridge for an upload to a playlist and a place in it, and the app opens the picker, streams
  one multipart as the server expects (see the drag & drop upload in [web-api.md](web-api.md)) and tells the client's
  upload queue of the progress and the outcome. Until the app names the feature the client offers no upload in the app.
- **Files:** `ACTION_OPEN_DOCUMENT`, filtered by the formats the player takes.
- **Folders:** `ACTION_OPEN_DOCUMENT_TREE`, walked with `DocumentFile` and sent with relative names
  (`Album/CD1/01.flac`).
- Uploads run in the same kind of job as downloads, so that they outlive the page in the background.
- A share target: "Send to AIMP" for audio files from other apps.

### Notification and volume

- Media3 builds the notification from the session; the foreground service runs while the player plays (type
  `mediaPlayback`) and leaves the foreground on pause, keeping a dismissible notification. Media session notifications
  are exempt from the notification permission of Android 13.
- Covers come from `GET /api/v1/covers/{hash}?size=512` through a bitmap loader that uses the Digest client and its
  cache.
- The position is extrapolated from the last `player` event, as the web client does.
- The rocker: `handleSetDeviceVolume` / `handleChangeDeviceVolume` send `PATCH /api/v1/player` with `volume` 0..1; 20–25
  steps rather than 100. Android routes the rocker to a remote session only while it plays (AOSP); OEM builds differ —
  verify on a Pixel and a Samsung, screen on and off.
- Not MediaRouter: it routes the phone's own audio to another device, which is not the case here.

### Calls

Each player has its own action for a call: nothing, a lower volume (a set share) or a pause. While a call rings or goes
on, the action applies to every saved player that has one and answers, whether the app is connected to it or not. After
the call the volume or the playback comes back unless the user changed it meanwhile. What was changed is kept on disk:
the process may be gone before the call ends.

- **Ordinary calls, with the app closed too:** a manifest receiver of `PHONE_STATE` with `READ_PHONE_STATE`, asked for
  when the user first turns an action on. It sends the requests to the saved addresses; there is no time for discovery.
  To be verified on a device with the target SDK, and on OEM builds that stop background receivers.
- **Calls in messengers:** `AudioManager.OnModeChangedListener` (Android 12+, no permission) needs a live process, so
  they are caught only while the media session service runs, that is while its notification is there.
- Both feed one call state, so that a call seen by both changes a player once.

### Discovery and credentials

- mDNS: the plugin announces the service `_aimp-remote._tcp`, and the app looks for it with `NsdManager`. The UDP
  discovery on port 3332 stays for the old app alone. A kept player is its address and nothing else: the app connects to
  the kept address only. `GET /api/v1/settings` tells whether a login is needed (`401`).
- Passwords are kept in DataStore, in a file of their own in the app's private storage, and not sealed with a key of the
  Android Keystore: such a key stays on its device, and the passwords would not survive a move to a new one. A backup
  takes them only where nobody but the user can read the copy: a transfer from device to device, and a copy in the cloud
  that is encrypted with the screen lock. From Android 12 on the rules have no condition for a single file
  (`requireFlags` is not read there, verified on Android 17), so the whole cloud copy is made only when encrypted
  (`disableIfNoEncryptionCapabilities`); on Android 9 to 11 the list goes to the cloud always and the passwords on that
  condition; Android 8 backs up the list alone.
- The app works with the plugin 3.0 and later, and tells an older one before it asks for a login or opens the web view:
  the web client of the plugins 2.0 knows nothing of the bridge and reaches the API by itself, with a login the web view
  does not give it. The plugin names its version in the header `AIMP-Remote-Control-Version` of every answer, the `401`
  of the check among them, and in the `version` of its mDNS announcement; a plugin that names none is older than 3.0.
  Such a player stays in the list, with a card that says to update the plugin.

## Web client changes

Each made in the stage that needs it, and described in a bridge contract (`docs/android-bridge.md`, begun in stage 2 and
extended by the later ones):

- detecting the app, and the button that disconnects from the player;
- one way to the API, made twice, for a browser and for the bridge: requests, images, events and the connection state;
- the download of a track and the upload of files asked of the app, and hidden in the app until it can do them.

## Repository and builds

- The app lives in `android/` in this repository, beside `plugin/` and `web-client/`: the bridge is a contract between
  parts of it, and the docs and the e2e bench are shared.
- Its own tags, `android-v*`, and its own workflow with path filters; the plugin's releases are tagged `plugin-v*`.
- `versionCode` comes from the version in the sources (1.2.3 → 10203), never from a CI run number, so that F-Droid
  builds the same number.
- AGENTS.md and the protocol doc call the old app "the app"; with the new one they say "the old Android app".

### Tools

Android Studio, Kotlin 2.x, AGP, Gradle Kotlin DSL with a version catalog. Compose BOM, Material 3, Media3 session,
OkHttp, kotlinx.serialization, kotlinx.coroutines, DataStore, androidx.webkit. `minSdk` 26, `targetSdk` the latest. R8
with resource shrinking.

The system web view must be 111 or later, the Chromium the web client is built for (the baseline of Next.js), and have
the message listener of the bridge; the list of players asks for an update where it is older, and connects to no player
until then. Android 8 and 9 get the web view up to 138 (Chrome 138 was the last for them, in 2025), which is enough, but
no more security updates.

### Testing

- JUnit for the Digest client and the SSE parser, Robolectric for the service.
- The emulator against the throwaway AIMP of the e2e tests, at `10.0.2.2`.
- A real device for discovery (the emulator's NAT drops broadcasts), the rocker, calls and OEM behaviour.
- `chrome://inspect` for the web view in debug builds (`setWebContentsDebuggingEnabled`).

## Signing and distribution

- **One signing key everywhere**, so that users can move between sources without reinstalling and losing their players.
  Kept in two safe places outside GitHub, and in CI secrets.
- **Google Play:** 25 USD once; identity check; a new personal account needs a closed test with 12 testers for 14 days;
  privacy policy, data safety form, a declaration with a video for the `mediaPlayback` foreground service; AAB. Play App
  Signing with **our own key uploaded** at registration, so that Play and GitHub builds match. Paying from Russia may
  not work — check first.
- **F-Droid:** builds from source; all dependencies are free. Merge request to `fdroiddata` with metadata; reproducible
  builds let it publish our signature. Risk: the unlicensed AIMP SDK in this repository — ask the F-Droid reviewers
  early; their metadata can delete it before the build.
- **GitHub releases** with the APK; IzzyOnDroid and Obtainium take it from there.
- **No self-updater**, so that one build serves all sources and Play's rules on updating outside Play are kept. A link
  to the sources is fine.
- Google's developer verification for apps outside Play (from September 2026 in four countries, worldwide in 2027) —
  check its state before release.

### Release automation

On an `android-v*` tag, GitHub Actions builds the signed APK and AAB, creates the GitHub release with the APK and
uploads the AAB to Play's internal track with `fastlane supply`, whose metadata layout F-Droid reads too. Play access
through Workload Identity Federation rather than a JSON key. Promotion to production stays manual. The first AAB is
uploaded by hand: the API cannot create the app.

## Stages

Built: the project, the list of players with their settings, discovery over mDNS, logins kept with the players and
checked before the web view opens, the web view with back navigation.

The stages, in this order; the first three are built too. Each stage is one finished change: it is reviewed and tried on
a device before the next one begins, and builds only on the stages before it.

1. **HTTP base** (built). OkHttp with a Digest session per player; the check made before connecting moves onto it, so
   that the app has one HTTP stack. On a device: connecting, a wrong password and a player that is off behave as before.
2. **The player's own app** (built). The connected player is kept by the container; opening the app shows it at once;
   Back leaves the app; the web client gets the button that disconnects, which leads to the list of players. The bridge
   and its contract begin here, with these messages alone.
3. **The API through the app** (built). The reader of the event stream, `PlayerConnection` with its retries,
   `ConnectedPlayer`; the web client reaches the API over the bridge alone — requests, images, events and the connection
   status — and the web view has no login. Brought forward from the end of the list: everything after it stands on the
   app's one connection, and it closed the web view's answering of any login challenge. On a device: the client works as
   before with and without a login, follows the player, shows a loss and comes back, and a changed password leads to the
   login.
4. **The notification shows the player.** The state's types, `PlaybackService` with a session that only shows: the
   track, the artist, playing or not. The service keeps the connection's network alive out of the screen. On a device:
   the notification follows the player, and comes back after the player restarts or Wi-Fi drops.
5. **Controls** in the notification and on the lock screen: play, pause, next, previous and seeking through `PlayerApi`,
   the position told between events. Whether the app plays silence for the buttons of a headset is decided here.
6. **The volume rocker.**
7. **Covers** in the notification.
8. **Ordinary calls:** the receiver, the actions, the record of what was changed; they work with the app closed.
9. **Calls in messengers,** while the service runs.
10. **Downloads,** asked of the app over the bridge.
11. **Uploads of files,** picked and sent by the app.
12. **Uploads of folders** and the share target.
13. **Polish,** each a change of its own: binding to Wi-Fi without internet, refusing a plugin that is too old,
    predictive back, Russian and English throughout.
14. **Release:** signing, CI, Play internal track, F-Droid submission.

Stages 8 to 12 depend on nothing after stage 5 and may change places; stages 1 to 7 may not.

## Open questions

- How long does a paused player stay connected in the background, and what does the app show when it is opened after the
  system stopped the service? Without a service the stream is lost within seconds of leaving the screen, and is retried
  to no end until the system freezes the app.
- Does the app play silence so that the buttons of a headset reach it?
- Can a Play developer account be paid for and kept from Russia?
- Will F-Droid build from this repository with the AIMP SDK in it?
- How do OEM builds route the rocker to a remote session, screen off included?
