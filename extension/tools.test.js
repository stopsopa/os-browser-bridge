import {
  splitOnce,
  normalizeListToArray,
  normalizeListToCommaSeparatedString,
  stringToIncludeExclude,
} from "./tools.js";
import test from "node:test";
import assert from "node:assert/strict";

// Happy path – delimiter present twice

test("splitOnce should correctly split event, tab and payload", () => {
  const input = "event::tab::restofstuffevencontaining next :: characters";
  const expected = {
    event: "event",
    tab: "tab",
    rawJson: "restofstuffevencontaining next :: characters",
  };

  assert.deepStrictEqual(splitOnce(input), expected);
});

// Happy path – empty tab

test("splitOnce should allow empty tab between delimiters", () => {
  const input = "event::::restofstuffevencontaining next :: characters";
  const expected = {
    event: "event",
    tab: "",
    rawJson: "restofstuffevencontaining next :: characters",
  };

  assert.deepStrictEqual(splitOnce(input), expected);
});

// Error cases

test("splitOnce should throw when input string is empty", () => {
  assert.throws(
    () => splitOnce(""),
    /splitOnce Event: String cannot be empty/
  );
});

test("splitOnce should throw when delimiter not present", () => {
  assert.throws(
    () => splitOnce("justastringwithnodelimiter"),
    /splitOnce Event: Delimiter/
  );
});

// Lists of tab ids (include / exclude)

test("normalizeListToArray should handle single values and empty input", () => {
  assert.deepStrictEqual(normalizeListToArray(undefined), []);
  assert.deepStrictEqual(normalizeListToArray(""), []);
  assert.deepStrictEqual(normalizeListToArray("a"), ["a"]);
  assert.deepStrictEqual(normalizeListToArray(123), ["123"]);
  assert.deepStrictEqual(normalizeListToArray(["a", "b"]), ["a", "b"]);
});

test("normalizeListToArray should split comma separated lists, also inside arrays", () => {
  assert.deepStrictEqual(normalizeListToArray("a,b"), ["a", "b"]);
  assert.deepStrictEqual(normalizeListToArray(["a,b", "c"]), ["a", "b", "c"]);
  assert.deepStrictEqual(normalizeListToArray("!a, b,,"), ["a", "b"]);
});

test("normalizeListToCommaSeparatedString should produce the same string for string and array input", () => {
  assert.equal(normalizeListToCommaSeparatedString("a,b"), "a,b");
  assert.equal(normalizeListToCommaSeparatedString(["a", "b"]), "a,b");
  assert.equal(normalizeListToCommaSeparatedString(undefined), "");
});

test("stringToIncludeExclude should decode tab filter", () => {
  assert.deepStrictEqual(stringToIncludeExclude(""), { include: [], exclude: [] });
  assert.deepStrictEqual(stringToIncludeExclude("a"), { include: ["a"], exclude: [] });
  assert.deepStrictEqual(stringToIncludeExclude("a,b"), { include: ["a", "b"], exclude: [] });
  assert.deepStrictEqual(stringToIncludeExclude("!a"), { include: [], exclude: ["a"] });
  assert.deepStrictEqual(stringToIncludeExclude("!a,b"), { include: [], exclude: ["a", "b"] });
});
