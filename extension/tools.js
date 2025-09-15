function _split(segment, delimiter, label) {
  if (typeof segment !== "string") {
    throw new TypeError(`splitOnce ${label}: First argument must be a string`);
  }

  if (!segment.length) {
    throw new Error(`splitOnce ${label}: String cannot be empty`);
  }

  if (typeof delimiter !== "string" || !delimiter.length) {
    throw new TypeError(`splitOnce ${label}: Delimiter must be a non-empty string`);
  }

  const index = segment.indexOf(delimiter);

  if (index === -1) {
    throw new Error(`splitOnce ${label}: Delimiter "${delimiter}" not found in string`);
  }

  const firstSegment = segment.slice(0, index);

  const rest = segment.slice(index + delimiter.length);

  return { firstSegment, rest };
}

export function splitOnce(str, delimiter = "::") {
  const { firstSegment: event, rest: afterEvent } = _split(str, delimiter, "Event");

  if (!event.length) {
    throw new Error("splitOnce Event: cannot be empty");
  }

  const { firstSegment: tab, rest } = _split(afterEvent, delimiter, "Tab");

  return { event, tab, rawJson: rest };
}

export function decodeJson(rawJson) {
  if (typeof rawJson !== "string") {
    throw new TypeError("decodeJson: First argument must be a string");
  }

  if (!rawJson.trim()) {
    throw new Error("decodeJson: String cannot be empty or only whitespace");
  }

  try {
    return JSON.parse(rawJson);
  } catch (e) {
    throw new Error("decodeJson: Failed to parse JSON: " + e.message);
  }
}

/**
 * This one transforms list to form:
 * {
    "Brave_1628888929": {
      "active": true,
      "audible": false,
      "autoDiscardable": true,
      "discarded": false,
      "favIconUrl": "",
      "frozen": false,
      "groupId": -1,
      "height": 999,
      "highlighted": true,
      "id": 1628888929,
      "incognito": false,
      "index": 0,
      "lastAccessed": 1757030914200.847,
      "mutedInfo": {
        "muted": false
      },
      "pinned": false,
      "selected": true,
      "status": "complete",
      "title": "Extensions",
      "url": "chrome://extensions/?errors=gpgnclhecipnnfikdcomhedaokikifoo",
      "width": 1984,
      "windowId": 1628888872,
      "browser": "Brave",
      "tab": "Brave_1628888929"
    },
    "Brave_1628888873": {
      "active": false,
      "audible": false,
      "autoDiscardable": true,
      "discarded": false,
      "frozen": false,
      "groupId": -1,
      "height": 999,
      "highlighted": false,
      "id": 1628888873,
      "incognito": false,
      "index": 1,
      "lastAccessed": 1757030912969.269,
      "mutedInfo": {
        "muted": false
      },
      "pinned": false,
      "selected": false,
      "status": "complete",
      "title": "listing directory /",
      "url": "http://localhost:8080/",
      "width": 1984,
      "windowId": 1628888872,
      "browser": "Brave",
      "tab": "Brave_1628888873"
    },
  */
export function processTabs(raw) {
  const tabs = {};

  for (const set of raw) {
    // set = { browserInfo, tabs }
    for (const tab of set.tabs) {
      const tmp = enrichTab(tab, set?.browserInfo);

      tabs[tmp.tab] = tmp;
    }
  }

  return tabs;
}

export function enrichTab(tab, browserInfo) {
  tab.name = browserInfo?.name;
  tab.__ = "__";
  tab.browserId = browserInfo?.browserId;
  tab.tab = `browserId_${browserInfo?.browserId}_tabId_${tab.id}`;
  return tab;
}

/**
 * @param {string | string[]} tabs
 * @returns {string[]}
 */
export function normalizeListToArray(tabs) {
  if (tabs && typeof tabs !== "undefined") {
    if (typeof tabs === "string") {
      tabs = tabs.split(",");
    }

    if (!Array.isArray(tabs)) {
      tabs = [tabs];
    }
  } else {
    tabs = [];
  }

  return tabs.filter(Boolean).map(String).map(stripBangPrefix).filter(Boolean).map(String);
}

export function normalizeListToCommaSeparatedString(tabs) {
  const array = normalizeListToArray(tabs);

  return array.join(",");
}

function browserAndTab(tab) {
  const [, browserId, , tabId] = String(tab).split("_");
  return { browserId, tabId };
}

/**
 * @param {string} str
 * @returns {string}
 */
export function stripBangPrefix(str) {
  let i = 0;
  while (i < str.length && str[i] === "!") {
    i++;
  }
  return str.slice(i);
}

/**
 * @type {import("./tools.types").StringToIncludeExcludeFn}
 */
export function stringToIncludeExclude(str) {
  /** @type {string[]} */
  let exclude = [];
  /** @type {string[]} */
  let include = [];
  if (str.startsWith("!")) {
    exclude = [stripBangPrefix(str)];
  } else {
    include = [str];
  }
  return { include, exclude };
}

export function escapeForHtmlAttr(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
