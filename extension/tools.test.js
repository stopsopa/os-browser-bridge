import { splitOnce } from "./tools.js";
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
