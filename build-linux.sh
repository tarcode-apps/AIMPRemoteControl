#!/usr/bin/env bash
#
# Builds the AIMP Remote Control plugin for Linux (x86_64).
# Artifacts are copied to dist/linux-x64/.
#
# Runs unchanged locally (including WSL on a /mnt/c checkout) and on GitHub
# Actions ubuntu runners.
#
# Usage:
#   ./build-linux.sh              # Release
#   ./build-linux.sh --debug
#   ./build-linux.sh --clean

set -euo pipefail

CONFIG=Release
CLEAN=0

usage()
{
    cat <<'EOF'
Builds the AIMP Remote Control plugin for Linux (x86_64) into dist/linux-x64/.

Options:
  --release   Release build (default)
  --debug     Debug build
  --clean     Delete the build directory before configuring
EOF
}

while [ $# -gt 0 ]; do
    case "$1" in
        --release) CONFIG=Release ;;
        --debug)   CONFIG=Debug ;;
        --clean)   CLEAN=1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "error: unknown option '$1'" >&2; usage >&2; exit 2 ;;
    esac
    shift
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRESET="linux-$(echo "$CONFIG" | tr '[:upper:]' '[:lower:]')"
BUILD_DIR="$REPO_ROOT/out/build/$PRESET"
DIST_DIR="$REPO_ROOT/dist/linux-x64"
ARTIFACT=aimp_remote_control.so

step() { printf '\n==> %s\n' "$1"; }

# Header-only dependencies live in submodules; an incomplete checkout otherwise
# fails much later with a confusing "no such file or directory".
for probe in \
    third_party/json/include/nlohmann/json.hpp \
    third_party/json-rpc-cxx/include/cxx/jsonrpc/server.hpp \
    third_party/cpp-httplib/httplib.h \
    third_party/asio/include/asio.hpp
do
    if [ ! -f "$REPO_ROOT/$probe" ]; then
        echo "error: missing dependency '$probe'." >&2
        echo "       run: git submodule update --init --recursive" >&2
        exit 1
    fi
done

for tool in cmake ninja; do
    if ! command -v "$tool" >/dev/null 2>&1; then
        echo "error: '$tool' not found." >&2
        echo "       run: sudo apt-get install -y cmake ninja-build build-essential" >&2
        exit 1
    fi
done

step "Building $PRESET"
if [ "$CLEAN" -eq 1 ]; then
    rm -rf "$BUILD_DIR"
fi

cd "$REPO_ROOT"
cmake --preset "$PRESET"
cmake --build --preset "$PRESET"

[ -f "$BUILD_DIR/$ARTIFACT" ] || { echo "error: build finished but $BUILD_DIR/$ARTIFACT is missing" >&2; exit 1; }

step "Packaging"
# Clear what a previous build left, but step over symlinks: a developer's
# wwwroot link into web-client/out lives here and has to survive.
mkdir -p "$DIST_DIR"
find "$DIST_DIR" -mindepth 1 -maxdepth 1 ! -type l -exec rm -rf {} +
cp "$BUILD_DIR/$ARTIFACT" "$DIST_DIR/"
cp -r "$REPO_ROOT/Langs" "$DIST_DIR/Langs"
cp "$BUILD_DIR/THIRD-PARTY-NOTICES.txt" "$DIST_DIR/"

if [ "$CONFIG" = Release ] && command -v strip >/dev/null 2>&1; then
    strip --strip-unneeded "$DIST_DIR/$ARTIFACT"
fi

# The plugin is useless to AIMP if its entry point stopped being exported:
# cheap guard against a visibility or linker-flag regression.
# No pipe into `grep -q` here: it exits on the first match, and the SIGPIPE that
# gives nm would trip `set -o pipefail`.
if command -v nm >/dev/null 2>&1; then
    exported=$(nm -D --defined-only "$DIST_DIR/$ARTIFACT")
    case "$exported" in
        *" AIMPPluginGetHeader"*) ;;
        *)
            echo "error: AIMPPluginGetHeader is not exported from $ARTIFACT" >&2
            exit 1
            ;;
    esac
fi

step "Done"
ls -lh "$DIST_DIR/$ARTIFACT" | awk '{print "    " $NF " (" $5 ")"}'
