
# detect wakeup

- [server/tools/detect_wakeup_macos_log.js](server/tools/detect_wakeup_macos_log.js)
- [server/tools/detect_wakeup_macos_log.sh](server/tools/detect_wakeup_macos_log.sh)
- [server/tools/detect_wakeup_macos_log_tampermonkey.js](server/tools/detect_wakeup_macos_log_tampermonkey.js)

event in the browser. This one is example of using it with [https://mynoise.net](https://mynoise.net/NoiseMachines/campingRainNoiseGenerator.php?l=48565372597259725527&title=Rain%20on%20a%20Tent)

```js

function isSoundPlaying() {
    return window.getComputedStyle(document.querySelector('#fftCanvas'), null).getPropertyValue("display") === 'block'
}
document.addEventListener("wokeup_v2", (event) => {
    if (isSoundPlaying()) {
        log('isSoundPlaying() === true')
        setTimeout(() => {
            document.querySelector('#mute').click()
        }, 5000)
    }
    else {
        log('is not playing')
    }
});

```

# detect media keys

- [server/tools/detect_media_macos.js](server/tools/detect_media_macos.js)
- [server/tools/detect_media_macos.sh](server/tools/detect_media_macos.sh)
- [server/tools/detect_media_macos_tampermonkey.js](server/tools/detect_media_macos_tampermonkey.js)

Detects press and release events for macOS media keys: Play/Pause, Next, Previous, Volume Up, Volume Down, Volume Mute

**Requirements:**
- macOS only
- Swift compiler (Xcode Command Line Tools)  
- Input Monitoring permission (macOS will prompt on first run)

**What it provides:**

The scripts detect and broadcast media key events via WebSocket. For volume mute events, both "pressed" and "released" events show the current system state **after** the mute action has been processed. Both events will have the same mute state value.

**Events in the browser:**

```js
// Play/Pause key
document.addEventListener("mediaPlay", (event) => {
    console.log('Play/Pause key:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.action === "pressed") {
        // Handle play/pause press
    }
});

// Next Track key
document.addEventListener("mediaNext", (event) => {
    console.log('Next key:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.action === "pressed") {
        // Handle next track press
    }
});

// Previous Track key
document.addEventListener("mediaPrevious", (event) => {
    console.log('Previous key:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.action === "pressed") {
        // Handle previous track press
    }
});

// Volume Up key
document.addEventListener("mediaVolumeUp", (event) => {
    console.log('Volume Up key:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.action === "pressed") {
        // Handle volume up press
    }
});

// Volume Down key
document.addEventListener("mediaVolumeDown", (event) => {
    console.log('Volume Down key:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.action === "pressed") {
        // Handle volume down press
    }
});

// Volume Mute key
document.addEventListener("mediaVolumeMute", (event) => {
    // Both "pressed" and "released" events show the state AFTER the mute action
    console.log('Current mute state:', event.detail.muted); // true (muted) or false (unmuted)
    console.log('Action:', event.detail.action); // "pressed" or "released"
    
    if (event.detail.muted === true) {
        console.log('System is muted');
    } else if (event.detail.muted === false) {
        console.log('System is unmuted');
    }
});
```

**event.detail structure:**
```js
// For mediaPlay, mediaNext, mediaPrevious, mediaVolumeUp, mediaVolumeDown:
{
    action: "pressed" | "released",
    timestamp: "2025-10-08T23:50:00.000Z"
}

// For mediaVolumeMute events:
{
    action: "pressed" | "released",
    timestamp: "2025-10-08T23:50:00.000Z",
    muted: true | false | null  // Both pressed and released show state AFTER the mute action
}
```

**Note:** For `mediaVolumeMute`, both "pressed" and "released" events will have the same `muted` value, representing the current system state after the mute toggle has been processed.

# detect modifier keys

- [server/tools/detect_modifiers_macos.js](server/tools/detect_modifiers_macos.js)
- [server/tools/detect_modifiers_macos.sh](server/tools/detect_modifiers_macos.sh)
- [server/tools/detect_modifiers_macos.swift](server/tools/detect_modifiers_macos.swift)

Detects press and release events for macOS keyboard modifier keys: Shift, Command, Option, Control, Fn, Caps Lock

**Requirements:**
- macOS only
- Swift compiler (Xcode Command Line Tools)
- Accessibility permission (macOS will prompt on first run)

**What it provides:**

The scripts detect and broadcast modifier key state changes via WebSocket. These events are useful for creating keyboard shortcuts, custom hotkey handlers, or UI indicators that respond to modifier key presses.

**Events in the browser:**

```js
// Shift key
document.addEventListener("keyboardShift", (event) => {
    console.log('Shift key:', event.detail.action); // "pressed" or "released"
});

// Command key
document.addEventListener("keyboardCommand", (event) => {
    console.log('Command key:', event.detail.action); // "pressed" or "released"
});

// Option/Alt key
document.addEventListener("keyboardOption", (event) => {
    console.log('Option key:', event.detail.action); // "pressed" or "released"
});

// Control key
document.addEventListener("keyboardControl", (event) => {
    console.log('Control key:', event.detail.action); // "pressed" or "released"
});

// Function key
document.addEventListener("keyboardFn", (event) => {
    console.log('Fn key:', event.detail.action); // "pressed" or "released"
});

// Caps Lock key
document.addEventListener("keyboardCapsLock", (event) => {
    console.log('Caps Lock:', event.detail.action); // "pressed" or "released"
});
```

**event.detail structure:**
```js
{
    action: "pressed" | "released",
    timestamp: "2025-10-18T12:34:56.789Z"
}
```

**Use cases:**
- Create custom keyboard shortcuts across all browser tabs
- Show visual indicators when modifier keys are held down
- Implement accessibility features that respond to modifier key states
- Build debugging tools that track modifier key usage
- Create custom hotkey combinations for web applications

**Note:** The plugin detects modifier key state changes system-wide using CGEventTap, which requires Accessibility permissions. Left and right variants of modifier keys (e.g., left Shift vs right Shift) are unified into single events.