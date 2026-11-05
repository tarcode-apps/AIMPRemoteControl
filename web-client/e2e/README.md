# End-to-end tests

[Playwright](https://playwright.dev) tests of the plugin's web API, its frozen
JSON-RPC and the web client, run against a real AIMP.

## Running

From `web-client/`:

```
npm run e2e          # everything
npm run e2e:api      # the API only, no browser
npm run e2e:ui       # the client at three screen sizes
npm run e2e:report   # the HTML report of the last run
```

One spec, or one size: the scripts end in `--project`, which would take a
file name for a project, so call Playwright itself:

```
npx playwright test --config e2e/playwright.config.ts --project=ui-mobile ui/queue
```

What a run needs:

- Windows with AIMP installed (`C:\Program Files\AIMP`, or `AIMP_DIR`).
- The plugin built for x64 (`build-windows.ps1 -Arch x64` in the repo root).
- For the UI: the client built (`npm run build`) and Google Chrome installed —
  the tests drive the installed Chrome instead of downloading a browser.
- **Your own AIMP closed.** The player runs one instance, and the tests start
  their own.

The run starts a **throwaway copy** of the installed AIMP: its binaries are
copied into `e2e/runtime/aimp/`, the built plugin is linked into its `Plugins`,
and a clean profile is seeded with every permission of the plugin on, no
authentication and the sound muted. Nothing of your own profile is read or
written. The copy is closed when the run ends and rebuilt from scratch on the
next one; it stays in `runtime/` for a look in between.

Everything a run creates is under `e2e/runtime/` (ignored by git):
`aimp/` the throwaway player and its profile, `media/` the generated tracks
(a passed test's are removed after it, a failed test's stay for a look),
`uploads/` the player's upload folder, `test-results/` traces and screenshots
of failed tests, `report/` the HTML report. The one exception: the tests that
delete tracks from disk send a few small generated WAV files to the Recycle
Bin, because that is where the player deletes to.

A few specs restart the throwaway player with other plugin settings — every
permission off, or Digest authentication on — or with a setting of the player
itself, such as the playlists' switch column hidden, and restore the usual
ones afterwards (`withPluginSettings` in `fixtures.ts`). They are skipped with
`E2E_PLAYER_URL`, since a player the run did not start cannot be restarted.

To test a player that is already running instead, set `E2E_PLAYER_URL`
(e.g. `http://127.0.0.1:3333`); it must have every permission on and no
authentication, and the tests will change its state: playback, queue, timer,
equalizer. `E2E_CLIENT_URL`
points the UI tests at another client, such as the dev server on
`http://localhost:3334`.

## Layout

```
e2e/
  playwright.config.ts   projects: api, ui-mobile (400×800), ui-desktop (1400×900), ui-desktop-wide (1920×1080)
  global-setup.ts        starts the throwaway player; global-teardown.ts closes it
  fixtures.ts            what a test asks for: api, events, media, playlists, presets;
                         withPluginSettings for the specs that restart the player
  lib/
    aimp.ts              the throwaway player: copy, seed, start, restart, stop
    api.ts               the web API and /RPC_JSON over Playwright's request context
    legacy.ts            ids and entries as the frozen protocol names them
    events.ts            the Server-Sent Events stream, with `next(name, predicate)`
    digest.ts            Digest authentication headers
    http.ts              requests Playwright cannot make, such as headers without a body
    media.ts             generated WAV tracks with tags (RIFF INFO, plus ID3 for the rest), CUE sheets, covers
    paths.ts             where things are
  api/*.spec.ts          one file per resource of the web API, plus the server,
                         authentication and permissions
  api/legacy/*.spec.ts   the frozen JSON-RPC protocol of the Android app
  ui/fixtures.ts         the page objects every UI test starts from: app, player
  ui/strings.ts          the client's texts by their en.json keys
  ui/pages/*.ts          page objects: locators and actions of one screen
  ui/*.spec.ts           scenarios in the client
```

## Conventions

- **Tests own their data.** A test gets playlists, tracks and preset names from
  the fixtures, which remove them afterwards; nothing refers to what else the
  player holds. Tracks are generated WAV files a few seconds long, so that
  the end of a track is quick to reach; a test that plays and looks makes them
  longer, so that nothing ends under it. `playlists.create` returns once the
  player has read the tags and stopped updating the playlist: a client that
  loads it earlier acts on a stale revision and is refused.
- **Order-independent.** A test puts the player into the state it needs
  (`api.resetEffects()`, a playlist of its own) rather than counting on the
  tests before it.
- **Controls by role and name**, as a user or a screen reader finds them:
  buttons, menu items, fields, sliders, dialogs
  (`getByRole('slider', { name: t('effects.preamp') })`). A control that loses
  its name fails the test, which is the point.
- **Containers by `data-testid`**: what has no accessible name of its own —
  a list's rows (`item-row`, `group-row`), the toolbar, the drawer, the
  subtitle, the parts of the player. Never by tag, position or CSS module
  class (`footer`, `h1 + p`, XPath): those break when the markup is
  rearranged. A new test id goes into the component, kebab-case, named for
  what the element is.
- **Texts from `en.json`**, through `t(key, values)` in `ui/strings.ts`, never
  as literals: a reworded label then needs no change here. `textPattern(key)`
  matches a text whatever its placeholders hold. Literals are for test data
  only: track titles, playlist names, AIMP's own preset names.
- **Two sides of every action.** A UI test checks what the screen shows and
  what the player reports (`expect.poll(() => api.effects())`); the player
  applies changes a moment after it answers, so polling is the rule, fixed
  waits are not.
- **Behaviour, not pixels.** No screenshot comparison and no checks of
  sizes or distances: the design changes, the behaviour stays.
- **Errors by code.** `error.code` is stable; `error.message` comes in the
  language of the player.
- **One gesture per pointer.** On `ui-mobile` the page objects tap (a tap
  plays a track); elsewhere they click and double-click, as a mouse does.
- **Sizes decide the layout**, not the project name: `app.drawerDocked` and
  `app.playerDocked` follow the client's breakpoints, and a test that has no
  meaning at a size says so with `test.skip`.
- The client is tested in English (`language` in localStorage, set by the
  `page` fixture).
- A UI test whose client request the player refused gets the request and
  the answer attached to its report as `client-api-errors`: such a refusal
  often leaves no trace on the screen.
- The timer tests never start a computer action (shutdown, restart, log off).
