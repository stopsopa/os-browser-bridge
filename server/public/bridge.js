
/**

   const event = await sendIdentifyTabEvent();
   const tabId = event?.detail?.tabId;
   prependToPre("tabId:", tabId);

   // event.detail.connected - boolean - tells if extension is connected to the server

   // by default it rejects after 2000ms without reply (extension not installed / not active on this page)
   // custom timeout in ms:
   const event = await sendIdentifyTabEvent(5000);

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

  return async function (timeout = 2000) {
    i += 1;
    const id = i;
    const message = {
      detail: { event: "identify_tab", payload: { id } },
    };
    // log("identify_tab event sent", message);
    const promise = new Promise((resolve, reject) => {
      // without this timeout promise would hang forever when extension is not there to reply
      const handler = setTimeout(() => {
        delete resolvers[id];

        reject(new Error(`bridge.js error: sendIdentifyTabEvent timeout after ${timeout}ms - no reply from the extension`));
      }, timeout);

      resolvers[id] = {
        resolve: (event) => {
          clearTimeout(handler);

          resolve(event);
        },
        reject,
      };
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

  Resolves immediately if extension is already connected to the server (it asks the extension about current state),
  otherwise waits for "os_browser_bridge_connection_status" event with isConnected: true.
  Rejects after timeout.

  WARNING: If you planning to listen to
  document.addEventListener("os_browser_bridge_connection_status", (event) => {
    then subscribe to it before wating for waitForConnectionStatus()
    because initial event os_browser_bridge_connection_status will arrive before waitForConnectionStatus()
*/
export function waitForConnectionStatus(timeout = 5000) {
  return new Promise((resolve, reject) => {
    const handler = setTimeout(() => {
      cleanup();

      reject(new Error("waitForConnectionStatus timeout"));
    }, timeout);

    function cleanup() {
      clearTimeout(handler);

      document.removeEventListener("os_browser_bridge_connection_status", bind);
    }

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
        cleanup();

        resolve({ type, isConnected, state });
      }
    }

    document.addEventListener("os_browser_bridge_connection_status", bind);

    /**
     * Initial os_browser_bridge_connection_status event might have been fired before we started listening,
     * so ask for current state too - reply for identify_tab carries "connected" flag
     */
    sendIdentifyTabEvent(timeout).then(
      (event) => {
        if (event?.detail?.connected) {
          cleanup();

          resolve({
            type: "os_browser_bridge_connection_status",
            isConnected: true,
            state: "connected",
          });
        }
      },
      () => {
        // no reply - timeout above will reject
      },
    );
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
