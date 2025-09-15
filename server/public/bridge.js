/**
 
   const event = await sendIdentifyTabEvent();
   const tabId = event?.detail?.tabId;
   prependToPre("tabId:", tabId);

 */
export const sendIdentifyTabEvent = (function () {
  /**
   * Function to get id of this tab
   */

  let i = 0;
  const resolvers = {};
  /**
   * Block demonstraging how to get id of this tab
   * Pay attention that we are registering event listener in document
   * and only then dispatching event
   */
  document.addEventListener("os_browser_bridge_identify_tab", (event) => {
    if (event?.detail?.id && resolvers[event?.detail?.id]) {
      resolvers[event?.detail?.id]?.resolve(event);
      delete resolvers[event?.detail?.id];
    }
  });

  return async function () {
    i += 1;
    const message = {
      detail: { event: "identify_tab", payload: { id: i } },
    };
    // log("identify_tab event sent", message);
    const promise = new Promise((resolve, reject) => {
      resolvers[i] = { resolve, reject };
    });

    document.documentElement.dispatchEvent(new CustomEvent("os_browser_bridge", message));

    return promise;
  };
})();

/** 
  try {
    await waitForConnectionStatus(1500);
  } catch (e) {
    console.log("error: " + e.message);
  }

  WARNING: If you planning to listen to
  document.addEventListener("os_browser_bridge_connection_status", (event) => {
    then subscribe to it before wating for waitForConnectionStatus()
    because initial event os_browser_bridge_connection_status will arrive before waitForConnectionStatus()
*/
export function waitForConnectionStatus(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const handler = setTimeout(timeoutFn, timeout);

    function bind(event) {
      const {
        type, // "os_browser_bridge_connection_status"
        detail: {
          isConnected, // boolean
          details: {
            state, // "connected"
          },
        },
      } = event;

      if (isConnected) {
        resolve({ type, isConnected, state });

        timeoutFn();
      }
    }

    function timeoutFn() {
      clearTimeout(handler);

      document.removeEventListener("os_browser_bridge_connection_status", bind);

      reject(new Error("waitForConnectionStatus timeout"));
    }

    document.addEventListener("os_browser_bridge_connection_status", bind);
  });
}

export function unique(pattern) {
  // node.js require('crypto').randomBytes(16).toString('hex');
  pattern || (pattern = "xyxyxy");
  return pattern.replace(/[xy]/g, function (c) {
    var r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
