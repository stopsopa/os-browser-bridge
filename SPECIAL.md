
# detect wakeup

- [server/tools/detect_wakeup_macos_log.js](server/tools/detect_wakeup_macos_log.js)
- [server/tools/detect_wakeup_macos_log.sh](server/tools/detect_wakeup_macos_log.sh)

event in the browser

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

Detects press and release events for macOS media keys: Play/Pause, Next, Previous

**Requirements:**
- macOS only
- Swift compiler (Xcode Command Line Tools)
- Input Monitoring permission (macOS will prompt on first run)

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
```

**event.detail structure:**
```js
{
    action: "pressed" | "released",
    timestamp: "2025-10-08T23:50:00.000Z"
}
```