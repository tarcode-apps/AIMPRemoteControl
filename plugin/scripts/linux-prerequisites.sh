# What build-linux.sh and test-linux.sh need before they configure, checked up
# front; both source this file.

check_prerequisites()
{
    local tool
    for tool in cmake ninja; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo "error: '$tool' not found." >&2
            echo "       run: sudo apt-get install -y cmake ninja-build build-essential" >&2
            exit 1
        fi
    done

    # The code is C++20 as GCC 13 understands it; an older compiler fails deep
    # in the build with no word about why.
    local compiler="${CXX:-g++}" major
    if ! command -v "$compiler" >/dev/null 2>&1; then
        echo "error: '$compiler' not found." >&2
        echo "       run: sudo apt-get install -y build-essential" >&2
        exit 1
    fi
    major=$("$compiler" -dumpversion 2>/dev/null | cut -d. -f1)
    if "$compiler" --version 2>/dev/null | head -n1 | grep -q 'g++\|GCC' && [ "${major:-0}" -lt 13 ]; then
        echo "error: $compiler is GCC $major; the build needs GCC 13 or newer." >&2
        exit 1
    fi
}
