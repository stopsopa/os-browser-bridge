// ==UserScript==
// @name         mynoise.net auto off on mac wakeup
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *://mynoise.net/*
// @icon         https://mynoise.net/favicon-32x32.png
// @grant        unsafeWindow
// ==/UserScript==

const scriptname = "mynoise.net auto off on mac wakeup";
function unique(pattern) {
  // node.js require('crypto').randomBytes(16).toString('hex');
  pattern || (pattern = "xyxyxy");
  return pattern.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const log = (function (log) {
  const un = unique();
  return (...args) =>
    log(
      `%ctampermonkey ${un} [${scriptname}] time: ${new Date().toISOString().substring(0, 19).replace(/T/, " ")}`,
      "color: hsl(289deg 68% 53%)",
      ...args
    );
})(
  (function () {
    try {
      return console.log;
    } catch (e) {
      return () => {};
    }
  })()
);
if (window.top === window.self) {
  //-- Don't run on frames or iframes
  log("loading");
} else {
  return log(`loading in iframe - stopped`, location.href);
}
(function () {
  "use strict";

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

})();
