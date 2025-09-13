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
    for (const tab of set.tabs) {
      tab.name = set?.browserInfo?.name;

      tab.__ = "__";

      tab.browserId = set?.browserInfo?.browserId;

      const id = `browserId_${set?.browserInfo?.browserId}_tabId_${tab.id}`;

      tab.tab = id;

      tabs[id] = tab;
    }
  }

  return tabs;
}
