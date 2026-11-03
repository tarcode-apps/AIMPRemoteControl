#!/usr/bin/env bash
#
# Builds and runs the unit tests (tests/) on Linux. The plugin's preset is
# configured with the tests turned on in a build folder of its own
# (out/build/<preset>-tests), so the plugin build stays as build-linux.sh
# leaves it. Fails when a test does.
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
  --clean     Delete the test build directory before configuring
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

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRESET="linux-$(echo "$CONFIG" | tr '[:upper:]' '[:lower:]')"
TEST_DIR="$REPO_ROOT/out/build/$PRESET-tests"

. "$REPO_ROOT/scripts/linux-prerequisites.sh"
check_prerequisites

printf '\n==> Testing %s\n' "$PRESET"
if [ "$CLEAN" -eq 1 ]; then
    rm -rf "$TEST_DIR"
fi

cd "$REPO_ROOT"
cmake --preset "$PRESET" -B "$TEST_DIR" -DAIMP_BUILD_TESTS=ON
cmake --build "$TEST_DIR" --target unit_tests
ctest --test-dir "$TEST_DIR" --output-on-failure
