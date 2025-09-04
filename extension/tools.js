export function splitOnce(str, delimiter = "::", special = "Event") {
  debugger;
  if (typeof str !== "string") {
    throw new TypeError("splitOnce ${special}: First argument must be a string");
  }

  if (!str.length) {
    throw new Error("splitOnce ${special}: String cannot be empty");
  }

  if (typeof delimiter !== "string" || !delimiter.length) {
    throw new TypeError("splitOnce ${special}: Delimiter must be a non-empty string");
  }

  const index = str.indexOf(delimiter);

  if (index === -1) {
    throw new Error(`splitOnce ${special}: Delimiter "${delimiter}" not found in string`);
  }

  const event = str.slice(0, index);

  let rawJson = str.slice(index + delimiter.length);

  let tab = null;

  if (special === "Event") {
    if (!event.length) {
      throw new Error(`splitOnce ${special}: cannot be empty`);
    }

    ({ event: tab, rawJson } = splitOnce(rawJson, delimiter, "Tab"));
  }

  return { event, tab, rawJson };
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
