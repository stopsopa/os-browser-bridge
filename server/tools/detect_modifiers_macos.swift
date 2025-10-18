import Cocoa
import CoreGraphics

class ModifierKeyMonitor {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var previousFlags: CGEventFlags = []

    // Modifier flag mappings
    private let modifierMappings: [(CGEventFlags, String)] = [
        (.maskShift, "#keyboardShift"),
        (.maskCommand, "#keyboardCommand"),
        (.maskAlternate, "#keyboardOption"),
        (.maskControl, "#keyboardControl"),
        (.maskSecondaryFn, "#keyboardFn"),
        // Note: Caps Lock is handled separately as it's a toggle
    ]

    init() {
        setupEventTap()
    }

    private func setupEventTap() {
        // Check for accessibility permissions
        let trusted = AXIsProcessTrustedWithOptions([
            kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true
        ] as CFDictionary)

        if !trusted {
            fputs("Warning: Process not trusted for accessibility. Please grant Accessibility permissions in System Preferences > Security & Privacy > Privacy > Accessibility\n", stderr)
            fputs("The application will continue to run, but may not receive events until permission is granted.\n", stderr)
        }

        // Create event tap for flags changed events
        let eventMask = (1 << CGEventType.flagsChanged.rawValue)

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
                guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
                let monitor = Unmanaged<ModifierKeyMonitor>.fromOpaque(refcon).takeUnretainedValue()
                monitor.handleEvent(type: type, event: event)
                return Unmanaged.passUnretained(event)
            },
            userInfo: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque())
        ) else {
            fputs("Error: Failed to create event tap. Please grant Accessibility permissions.\n", stderr)
            return
        }

        eventTap = tap
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)

        if let source = runLoopSource {
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            print("Modifier key monitor started. Press Ctrl+C to exit.", to: &standardError)
        } else {
            fputs("Error: Failed to create run loop source\n", stderr)
        }
    }

    private func handleEvent(type: CGEventType, event: CGEvent) {
        guard type == .flagsChanged else { return }

        let currentFlags = event.flags

        // Check each modifier for state change
        for (flag, eventName) in modifierMappings {
            let wasPressed = previousFlags.contains(flag)
            let isPressed = currentFlags.contains(flag)

            if wasPressed != isPressed {
                let action = isPressed ? "pressed" : "released"
                print("\(eventName) \(action)")
                fflush(stdout)
            }
        }

        // Handle Caps Lock separately (it's a toggle, not a momentary press)
        let wasCapsLock = previousFlags.contains(.maskAlphaShift)
        let isCapsLock = currentFlags.contains(.maskAlphaShift)

        if wasCapsLock != isCapsLock {
            let action = isCapsLock ? "pressed" : "released"
            print("#keyboardCapsLock \(action)")
            fflush(stdout)
        }

        previousFlags = currentFlags
    }

    func run() {
        CFRunLoopRun()
    }

    deinit {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
            CFMachPortInvalidate(tap)
        }

        if let source = runLoopSource {
            CFRunLoopSourceInvalidate(source)
        }
    }
}

var standardError = FileHandle.standardError

extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}

// Start monitoring
let monitor = ModifierKeyMonitor()
monitor.run()
