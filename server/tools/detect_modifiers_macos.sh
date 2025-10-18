#!/usr/bin/env bash

set -euo pipefail

# macOS modifier key detector using Swift CGEventTap
# Detects press and release events for: Shift, Command, Option, Control, Fn, Caps Lock
#
# This script compiles and runs a Swift program that monitors modifier key state changes
# Output format: "#keyboardShift pressed", "#keyboardShift released", "#keyboardCommand pressed", etc.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWIFT_SOURCE="$SCRIPT_DIR/detect_modifiers_macos.swift"
COMPILED_BINARY="$SCRIPT_DIR/.detect_modifiers_macos_bin"

# Check if we're on macOS
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Error: This script requires macOS (Darwin)" >&2
    exit 1
fi

# Check if Swift compiler is available
if ! command -v swiftc >/dev/null 2>&1; then
    echo "Error: Swift compiler (swiftc) not found. Please install Xcode Command Line Tools." >&2
    exit 1
fi

# Check if Swift source exists
if [ ! -f "$SWIFT_SOURCE" ]; then
    echo "Error: Swift source file not found at $SWIFT_SOURCE" >&2
    exit 1
fi

# Compile the Swift program if not already compiled or if source changed
if [ ! -f "$COMPILED_BINARY" ] || [ "$SWIFT_SOURCE" -nt "$COMPILED_BINARY" ]; then
    echo "Compiling Swift modifier key detector..." >&2
    if ! swiftc -O "$SWIFT_SOURCE" -o "$COMPILED_BINARY" 2>&1; then
        echo "Error: Failed to compile Swift program" >&2
        exit 1
    fi
    echo "Compilation successful" >&2
fi

# Run the compiled binary
exec "$COMPILED_BINARY"
