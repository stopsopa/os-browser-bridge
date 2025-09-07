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
