# Android app plan

A new Android app for AIMP Remote Control: a native shell around the web client, with what only a native app can do. It
talks to the player over `/api/v1` ([web-api.md](web-api.md)), never over the frozen `/RPC_JSON`, which stays for the
old Android app (v2.0.31). Nothing here is built yet; this is the agreed plan, decided 2026-11.

## Features

- A list of players, added by hand or found on the local network.
- Scanning the local network for players.
- Login and password per player, kept encrypted.
- A notification with the playing track and controls, also on the lock screen, watches and in the car.
- Lowering the volume of the chosen player while a call rings or goes on.
- The phone's volume rocker sets the player's volume.
- The web client, shown full screen.

## Architecture

Three layers in one app:

- **Native shell** — Kotlin and Jetpack Compose, one Activity: players, scanning, login, settings.
- **Media session service** — a Media3 `MediaSessionService` that holds the one event stream (`GET /api/v1/events`) of
  the chosen player. Its player is a `SimpleBasePlayer` facade over HTTP calls with a remote `DeviceInfo`
  (`PLAYBACK_TYPE_REMOTE`, 0..100): it plays no audio and takes no audio focus. The system builds the notification, lock
  screen and headset controls from it and routes the volume rocker to it.
- **Web client** — a `WebView` that loads the client from the player itself (`http://<ip>:3333/`), so the client always
  matches the plugin. A bridge over `WebViewCompat.addWebMessageListener` connects it to the shell.

App-wide wiring is a plain container object created in `Application` (players store, Digest client, player state
repository); no DI framework.

### Network

- **Cleartext HTTP** to the local network is allowed by a `network_security_config`; the player serves no HTTPS.
- **Wi-Fi without internet:** Android moves traffic to mobile data when Wi-Fi has no internet, which loses the player.
  The process is bound to the Wi-Fi network (`ConnectivityManager.bindProcessToNetwork`), the `WebView` included.
- **Digest:** OkHttp has no Digest of its own. First try the `okhttp-digest` library against the throwaway player; the
  server answers a reused `nc` with `stale=true` (see [remote-control-protocol.md](remote-control-protocol.md)), so
  parallel requests must not share counters carelessly. Our own client is about 150 lines if the library falls short:
  one session per player with `nonce`, `cnonce`, an atomic `nc`, a retry on `stale=true`.
- **Local network permission:** newer Android versions add a permission for local network access. Check what the target
  SDK requires before the first release.

### The event stream, shared

The native service owns the stream; the web client opens none of its own in the app:

- `web-client/app/_api/helpers/events.ts` subscribes through one `on(name, handler)` over `EventSource`. It gets a
  source factory: `EventSource` in a browser, an object of the same shape over the bridge in the app.
- The native side forwards each event with its name and data, and sends `open` whenever the web view attaches, after a
  return from the background too; the client then invalidates its queries, as it does on a reopened stream now.
- The connection state (`web-client/app/_api/helpers/connection.ts`) is fed by the native side: the banner, paused
  queries and blocked navigation keep working unchanged. The silence watchdog and the retries move to the native side.

### Authentication in the web view

`WebViewClient.onReceivedHttpAuthRequest` answers every Digest challenge with the stored login and password: the page,
scripts, `fetch`, images and the stream share one network stack. Wrong credentials cancel the request and open the
native login. No change on the server or in the client.

### Downloads

- The system `DownloadManager` cannot answer Digest, and a pre-signed header breaks on resume (the server refuses a
  reused `nc`). Downloads are native: OkHttp with the Digest client, `Range` to resume, written to
  `MediaStore.Downloads` (no storage permission), progress in a notification.
- The web view's `DownloadListener` hands the URL over; the bridge offers `download(url)` so that the client skips its
  own `fetch` pre-check.
- In the background: a user-initiated data transfer job (Android 14+), a WorkManager worker in foreground mode on
  Android 8–13. A plain coroutine dies with the process.

### Uploads

- **Files:** the client's hidden `<input type="file" multiple>` raises `WebChromeClient.onShowFileChooser`; the app
  opens `ACTION_OPEN_DOCUMENT` filtered by `accept` and returns `content://` URIs. The client's upload queue works
  unchanged.
- **Folders:** a web view takes no document tree. The bridge offers `uploadFolder(playlistId, placement)`: the app opens
  `ACTION_OPEN_DOCUMENT_TREE`, walks it with `DocumentFile` and streams one multipart with relative names
  (`Album/CD1/01.flac`), as the server expects (see the drag & drop upload in [web-api.md](web-api.md)).
- Large uploads run natively in the same kind of job as downloads: an upload inside the web view dies with the page in
  the background.
- A share target: "Send to AIMP" for audio files from other apps.

### Notification and volume

- Media3 builds the notification from the session; the foreground service runs while the player plays (type
  `mediaPlayback`) and leaves the foreground on pause, keeping a dismissible notification. Media session notifications
  are exempt from the notification permission of Android 13.
- Covers come from `GET /api/v1/covers/{hash}?size=512` through a bitmap loader that uses the Digest client.
- The position is extrapolated from the last `player` event, as the web client does.
- The rocker: `handleSetDeviceVolume` / `handleChangeDeviceVolume` send `PATCH /api/v1/player` with `volume` 0..1; 20–25
  steps rather than 100. Android routes the rocker to a remote session only while it plays (AOSP); OEM builds differ —
  verify on a Pixel and a Samsung, screen on and off.
- Not MediaRouter: it routes the phone's own audio to another device, which is not the case here.

### Calls

`AudioManager.OnModeChangedListener` (Android 12+, no permission), a `TelephonyCallback` with `READ_PHONE_STATE` below.
While a call rings or goes on, the player's volume drops to a set share; after it, the volume comes back unless the user
changed it meanwhile.

### Discovery and credentials

- A UDP datagram to port 3332 on the broadcast address of each interface, with a `MulticastLock` where reception needs
  it; the answer is the host name, the player is `<ip>:3333`. `GET /api/v1/settings` then tells whether a login is
  needed (`401`).
- Passwords are encrypted with an AES-GCM key from the Android Keystore and kept in DataStore; not `security-crypto`,
  which is deprecated.
- The plugin's version comes with the `hello` event; the app refuses players whose plugin is too old for it.

## Web client changes

Small, made before the native code, and described in a bridge contract (`docs/android-bridge.md`, to be written in stage
1):

- detecting the app;
- the event source factory and the connection state fed by the bridge;
- `download(url)` instead of the browser download;
- `uploadFolder(...)` for folders.

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

1. **Bridge contract** and the web client changes it needs.
2. **Skeleton:** project, Compose, players added by hand, DataStore, the web view with Digest and back navigation.
   Useful from here on.
3. **Discovery** over UDP 3332.
4. **Credentials** in the Keystore, login on the first `401`.
5. **Service and notification:** the stream on OkHttp, Media3 session, covers, foreground rules.
6. **Volume and calls.**
7. **Bridge:** shared events, downloads, file chooser, folder uploads, share target.
8. **Polish:** edge-to-edge (Android 15), predictive back, foreground service types, Russian and English, loss of Wi-Fi.
9. **Release:** signing, CI, Play internal track, F-Droid submission.

## Open questions

- Does `okhttp-digest` keep to the server's `nc` rules under parallel requests?
- Can a Play developer account be paid for and kept from Russia?
- Will F-Droid build from this repository with the AIMP SDK in it?
- How do OEM builds route the rocker to a remote session, screen off included?
- What does the local network permission of the target SDK require?
