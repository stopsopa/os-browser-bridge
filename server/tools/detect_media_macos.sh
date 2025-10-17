#!/usr/bin/env bash

set -euo pipefail

# macOS media key detector using Swift IOKit
# Detects press and release events for: play/pause, next, previous, volume up/down, mute
#
# This script compiles and runs a Swift program that monitors media keys
# Output format: "play pressed", "play released", "next pressed", "mediaVolumeUp pressed", etc.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SWIFT_SOURCE="$SCRIPT_DIR/detect_media_macos.swift"
COMPILED_BINARY="$SCRIPT_DIR/.detect_media_macos_bin"

# Swift source code for media key detection
cat > "$SWIFT_SOURCE" << 'EOF'
import Cocoa
import IOKit.hid

class MediaKeyMonitor {
    private var hidManager: IOHIDManager?
    
    init() {
        setupHIDManager()
    }
    
    private func setupHIDManager() {
        hidManager = IOHIDManagerCreate(kCFAllocatorDefault, IOOptionBits(kIOHIDOptionsTypeNone))
        
        guard let manager = hidManager else {
            fputs("Error: Failed to create HID manager\n", stderr)
            return
        }
        
        // Filter for consumer control devices (where media keys are)
        let deviceMatch = [
            kIOHIDDeviceUsagePageKey: kHIDPage_Consumer,
            kIOHIDDeviceUsageKey: kHIDUsage_Csmr_ConsumerControl
        ] as CFDictionary
        
        IOHIDManagerSetDeviceMatching(manager, deviceMatch)
        
        // Register input value callback
        let context = UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        IOHIDManagerRegisterInputValueCallback(manager, { context, result, sender, value in
            guard let context = context else { return }
            let monitor = Unmanaged<MediaKeyMonitor>.fromOpaque(context).takeUnretainedValue()
            monitor.handleInputValue(value)
        }, context)
        
        // Schedule with run loop
        IOHIDManagerScheduleWithRunLoop(manager, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
        
        // Open the manager
        let openResult = IOHIDManagerOpen(manager, IOOptionBits(kIOHIDOptionsTypeNone))
        if openResult != kIOReturnSuccess {
            fputs("Error: Failed to open HID manager (access may be denied)\n", stderr)
            fputs("Please grant 'Input Monitoring' permission in System Preferences > Security & Privacy\n", stderr)
        }
    }
    
    private func handleInputValue(_ value: IOHIDValue) {
        let element = IOHIDValueGetElement(value)
        let usagePage = IOHIDElementGetUsagePage(element)
        let usage = IOHIDElementGetUsage(element)
        let intValue = IOHIDValueGetIntegerValue(value)
        
        // Only process consumer control page
        guard usagePage == kHIDPage_Consumer else { return }
        
        // Map usage codes to key names
        var keyName: String?
        switch Int(usage) {
        case kHIDUsage_Csmr_PlayOrPause:
            keyName = "#mediaPlay"
        case kHIDUsage_Csmr_ScanNextTrack, kHIDUsage_Csmr_FastForward:
            keyName = "#mediaNext"
        case kHIDUsage_Csmr_ScanPreviousTrack, kHIDUsage_Csmr_Rewind:
            keyName = "#mediaPrevious"
        case kHIDUsage_Csmr_VolumeIncrement:
            keyName = "#mediaVolumeUp"
        case kHIDUsage_Csmr_VolumeDecrement:
            keyName = "#mediaVolumeDown"
        case kHIDUsage_Csmr_Mute:
            keyName = "#mediaVolumeMute"
        default:
            return
        }
        
        if let key = keyName {
            let event = intValue != 0 ? "pressed" : "released"
            print("\(key) \(event)")
            fflush(stdout)
        }
    }
    
    func run() {
        print("Media key monitor started. Press Ctrl+C to exit.", to: &standardError)
        CFRunLoopRun()
    }
}

var standardError = FileHandle.standardError

extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}

// Check for accessibility permissions
let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary)
if !trusted {
    fputs("Warning: Process not trusted for accessibility. Some features may not work.\n", stderr)
}

let monitor = MediaKeyMonitor()
monitor.run()
EOF

    # Compile the Swift program if not already compiled or if source changed
    if [ ! -f "$COMPILED_BINARY" ] || [ "$SWIFT_SOURCE" -nt "$COMPILED_BINARY" ]; then
        echo "Compiling Swift media key detector..." >&2
        if ! swiftc -O "$SWIFT_SOURCE" -o "$COMPILED_BINARY" 2>&1; then
            echo "Error: Failed to compile Swift program" >&2
            exit 1
        fi
        echo "Compilation successful" >&2
    fi
    
    # Run the compiled binary
    exec "$COMPILED_BINARY"

