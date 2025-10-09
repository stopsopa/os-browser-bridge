// ==UserScript==
// @name         🧰 youtube media buttons - increase speed & rewind
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @include      /youtube\.com\//
// @icon         https://i.imgur.com/Fx0vfuw.png
// @grant        none
// ==/UserScript==

const scriptname = "🧰 youtube media buttons - increase speed & rewind";

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
  return log(`loading in iframe - stopped`);
}

(function () {
  "use strict";

  log("loaded");

  (async function () {
    const video = await new Promise((resolve, reject) => {
      function run() {
        const video = document.querySelector("video");
        if (video) {
          return resolve(video);
        } else {
          log("video element not found");
          setTimeout(run, 800);
        }
      }
      run();
    });

    log("video found", video);

    let holdTimeout = null;
    let isHolding = false;

    document.addEventListener("mediaNext", (event) => {
      log("mediaNext :", event.detail.action);

      if (event.detail.action === "pressed") {
        isHolding = false;

        // after 500ms of holding, go 2×
        holdTimeout = setTimeout(() => {
          isHolding = true;
          video.playbackRate = 2;
          log("→ Started 2× speed");
        }, 500); // adjust threshold as needed
      } else {
        // "released"
        clearTimeout(holdTimeout);

        if (isHolding) {
          // was in hold mode → restore 1×
          video.playbackRate = 1;
          log("→ Back to 1× speed");
        } else {
          // short press → jump ahead 3 s
          video.currentTime = Math.min(video.duration, video.currentTime + 3);
          log("→ Skipped ahead 3 s");
        }

        isHolding = false;
      }
    });

    document.addEventListener("mediaPrevious", (event) => {
      log("mediaPrevious:", event.detail.action);

      if (event.detail.action === "pressed") {
        video.currentTime = Math.max(0, video.currentTime - 3);
      }
    });
  })();
})();
