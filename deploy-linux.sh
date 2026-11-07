#!/usr/bin/env bash
#
# Builds the plugin into the AIMP installed on this machine (WSL included) and
# restarts it: stops AIMP, links its Plugins folder at dist/linux-x64 and the
# plugin's wwwroot at web-client/out, builds with build-linux.sh and starts AIMP
# again. The links are made once and left as they are afterwards; something
# else already in their place stops the script rather than being removed,
# unless --force: then a link elsewhere is replaced (only the link) and a real
# folder or file is renamed to <name>.backup-<time>, as after moving the repo.
# AIMP is started again even when the build fails; the script fails then too.
# The web client is not built here: wwwroot shows whatever web-client/out holds.
#
# The player is the one in AIMP_DIR, /opt/aimp by default.
#
# Usage:
#   ./deploy-linux.sh              # Release
#   ./deploy-linux.sh --debug
#   ./deploy-linux.sh --no-start   # leave AIMP stopped, for a debugger to start it
#   ./deploy-linux.sh --force      # repoint the links, as after moving the repo

set -euo pipefail

CONFIG_FLAG=--release
START=1
FORCE=0

usage()
{
    cat <<'USAGE'
Builds the plugin into the installed AIMP and restarts it.

Options:
  --release    Release build (default)
  --debug      Debug build
  --no-start   Leave AIMP stopped, for a debugger to start it
  --force      Repoint the links whatever is in their place; a real folder
               or file there is renamed to <name>.backup-<time>
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        --release)  CONFIG_FLAG=--release ;;
        --debug)    CONFIG_FLAG=--debug ;;
        --no-start) START=0 ;;
        --force)    FORCE=1 ;;
        -h|--help)  usage; exit 0 ;;
        *) echo "error: unknown option '$1'" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYER_DIR="${AIMP_DIR:-/opt/aimp}"
PLAYER="$PLAYER_DIR/AIMP"
DIST_DIR="$REPO_ROOT/dist/linux-x64"

step() { printf '\n==> %s\n' "$1"; }

# link <path> <target>
link()
{
    if [ -L "$1" ] && [ "$(readlink -f "$1")" = "$(readlink -f "$2")" ]; then
        return
    fi
    if [ -L "$1" ] && [ "$FORCE" -eq 1 ]; then
        rm -f "$1"
    elif [ -e "$1" ] && [ "$FORCE" -eq 1 ]; then
        local backup
        backup="$1.backup-$(date +%Y%m%d-%H%M%S)"
        mv "$1" "$backup"
        echo "    $1 moved aside as $(basename "$backup")"
    elif [ -e "$1" ] || [ -L "$1" ]; then
        echo "error: '$1' is already there and is not a link to '$2'. Move it away, or run again with --force." >&2
        exit 1
    fi
    ln -s "$2" "$1"
    echo "    $1 -> $2"
}

[ -x "$PLAYER" ] || { echo "error: AIMP is not in '$PLAYER_DIR'; set AIMP_DIR to the player's folder." >&2; exit 1; }
echo "AIMP: $PLAYER"

step "Stopping AIMP"
# Through the player's own command line: the running copy takes -EXIT over from
# the second one and quits as from its menu, playlists saved. A modal dialog of
# its own keeps it from quitting. Started through /usr/bin/aimp the process is
# "aimp", directly "AIMP".
if pgrep -x 'aimp|AIMP' >/dev/null; then
    "$PLAYER" -EXIT >/dev/null 2>&1
    for _ in $(seq 60); do
        pgrep -x 'aimp|AIMP' >/dev/null || break
        sleep 0.25
    done
    if pgrep -x 'aimp|AIMP' >/dev/null; then
        echo "error: AIMP did not quit. A dialog of its own may be open: close it and run again." >&2
        exit 1
    fi
fi

step "Linking"
mkdir -p "$DIST_DIR" "$PLAYER_DIR/Plugins"
link "$PLAYER_DIR/Plugins/aimp_remote_control" "$DIST_DIR"
link "$DIST_DIR/wwwroot" "$REPO_ROOT/web-client/out"

status=0
"$REPO_ROOT/build-linux.sh" "$CONFIG_FLAG" || status=$?

if [ "$START" -eq 1 ]; then
    step "Starting AIMP"
    setsid "$PLAYER" >/dev/null 2>&1 < /dev/null &
fi
exit "$status"
