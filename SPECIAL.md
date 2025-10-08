
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