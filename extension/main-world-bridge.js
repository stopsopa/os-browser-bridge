(function () {
  if (window.__osBrowserBridgeMediaSessionPatched) return;
  window.__osBrowserBridgeMediaSessionPatched = true;

  if (!navigator.mediaSession) return;

  const actionsToNeutralize = ["nexttrack", "previoustrack"];
  const orig = navigator.mediaSession.setActionHandler.bind(
    navigator.mediaSession,
  );

  // Proxy the setter so we can wrap any handler the page provides
  navigator.mediaSession.setActionHandler = function (action, handler) {
    const isNeutralized = actionsToNeutralize.includes(action);

    return orig(action, (details) => {
      // Alert the bridge detection logic that a native press occurred
      // We dispatch to 'window' so 'content.js' can listen in the Isolated world
      window.dispatchEvent(
        new CustomEvent("os_browser_bridge_native_mediasession_fired", {
          detail: { action },
        }),
      );

      if (isNeutralized) {
        console.log("os-browser-bridge: neutralized native action:", action);
      } else if (handler) {
        return handler(details);
      }
    });
  };

  // Pre-neutralize existing handlers (for late-injected cases)
  actionsToNeutralize.forEach((action) => {
    orig(action, () => {
      window.dispatchEvent(
        new CustomEvent("os_browser_bridge_native_mediasession_fired", {
          detail: { action },
        }),
      );
    });
  });
})();
