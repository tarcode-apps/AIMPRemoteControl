# Changelog

## 2.0.0 — 2026-11-08

AIMP can now be controlled from a browser on any device of the local network. The AIMP Remote Control app keeps working
unchanged.

### In a browser

- Every playlist with its groups, covers and ratings; creating, renaming and deleting playlists, sorting and moving
  tracks.
- Search in a playlist or across all playlists.
- Playback, seeking, volume, shuffle and repeat, synced lyrics, track information, radio capture.
- The queue, the sleep timer, sound effects and the 20-band equalizer with its presets.
- Favorites.
- Adding files of the computer and streams; uploading files and whole folders by dragging them onto a playlist;
  downloading tracks.
- Layouts for a mobile and a wide screen, light and dark themes, English and Russian.

### Plugin

- A permission to download tracks, on by default.
- Uploads of up to 16 GB (4 GB in the 32-bit build); an upload that fails leaves nothing behind.
- Stricter authentication.
- Error messages in the language of the player's interface.

### The AIMP Remote Control app

- Downloads resume after a broken connection, unless authentication is on.
- The file browser sorts names as the system does: `Track 9` before `Track 10`.

## 1.3.1 — 2026-09-01

- The Stop command.
- Browsing the computer's files needs the upload permission too: the app reaches its file browser through the upload
  menu.

## 1.3.0 — 2026-08-27

The first release: an open-source server for the AIMP Remote Control Android app, for AIMP 5 and 6 on Windows and Linux.
