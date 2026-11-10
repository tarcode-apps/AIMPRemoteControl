#!/usr/bin/env bash
#
# Builds and runs the unit tests (tests/) on Linux. The test programs are built
# in the same build folder as the plugin (out/build/<preset>), so the plugin's
# objects are compiled once for both. Fails when a test does.
#
# Usage:
#   ./test-linux.sh              # Release
#   ./test-linux.sh --debug
#   ./test-linux.sh --clean

set -euo pipefail

CONFIG=Release
CLEAN=0

usage()
{
    cat <<'USAGE'
Builds and runs the unit tests on Linux (x86_64).

Options:
  --release   Release build (default)
  --debug     Debug build
  --clean     Delete the build directory before configuring
USAGE
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

PLUGIN_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRESET="linux-$(echo "$CONFIG" | tr '[:upper:]' '[:lower:]')"
BUILD_DIR="$PLUGIN_ROOT/out/build/$PRESET"

. "$PLUGIN_ROOT/scripts/linux-prerequisites.sh"
check_prerequisites

printf '\n==> Testing %s\n' "$PRESET"
if [ "$CLEAN" -eq 1 ]; then
    rm -rf "$BUILD_DIR"
fi

cd "$PLUGIN_ROOT"
# Set outright: a build folder configured before the option existed keeps OFF
# in its cache whatever the default is now.
cmake --preset "$PRESET" -DAIMP_BUILD_TESTS=ON
cmake --build --preset "$PRESET" --target unit_tests
ctest --test-dir "$BUILD_DIR" --output-on-failure
