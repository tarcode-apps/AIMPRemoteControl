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
}
