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
 * Normalizes list of tab ids to flat array of strings.
 * Comma separated lists are split - also when they are elements of an array.
 * Leading "!" (exclude marker) and surrounding whitespaces are removed from each id.
 *
 * normalizeListToArray("a")            -> ["a"]
 * normalizeListToArray("a,b")          -> ["a", "b"]
 * normalizeListToArray("!a, b")        -> ["a", "b"]
 * normalizeListToArray(["a,b", "c"])   -> ["a", "b", "c"]
 * normalizeListToArray(123)            -> ["123"]
 * normalizeListToArray(undefined)      -> []
 *
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

  return tabs
    .filter(Boolean)
    .map(String)
    .flatMap((item) => item.split(","))
    .map((item) => stripBangPrefix(item.trim()).trim())
    .filter(Boolean);
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
 * Decodes tab filter (middle segment of the message from the server "event::tabFilter::json")
 *
 * stringToIncludeExclude("")       -> { include: [], exclude: [] }           all tabs
 * stringToIncludeExclude("a")      -> { include: ["a"], exclude: [] }
 * stringToIncludeExclude("a,b")    -> { include: ["a", "b"], exclude: [] }
 * stringToIncludeExclude("!a")     -> { include: [], exclude: ["a"] }
 * stringToIncludeExclude("!a,b")   -> { include: [], exclude: ["a", "b"] }   one leading ! marks entire list
 *
 * @type {import("./tools.types").StringToIncludeExcludeFn}
 */
export function stringToIncludeExclude(str) {
  /** @type {string[]} */
  let exclude = [];
  /** @type {string[]} */
  let include = [];
  if (str.startsWith("!")) {
    exclude = normalizeListToArray(str);
  } else {
    include = normalizeListToArray(str);
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

/**
 * Checks if given name can be used as the name of the event travelling through the bridge.
 *
 * Message from the server to the extension has format "event::tabFilter::json"
 * so event name must not contain "::" (and must not end with ":") or message would be split in wrong place.
 *
 * Rules:
 *  - string, 1 to 200 characters
 *  - no whitespaces
 *  - single colons are allowed, but only between other characters (not at the beginning, not at the end, not "::")
 *
 * isValidEventName("myevent")                -> true
 * isValidEventName("other_tabs:broadcast")   -> true
 * isValidEventName("a:b:c"), ("#media-x.y")  -> true
 * isValidEventName("a::b")                   -> false
 * isValidEventName("a:"), (":a")             -> false
 * isValidEventName("my event"), (""), (undefined), (123) -> false
 *
 * @param {any} name
 * @returns {boolean}
 */
export function isValidEventName(name) {
  return typeof name === "string" && name.length <= 200 && /^[^\s:]+(:[^\s:]+)*$/.test(name);
}
