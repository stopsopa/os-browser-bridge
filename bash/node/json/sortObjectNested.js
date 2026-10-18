#!/usr/bin/env node
/**
 * =================
 * Transpiled with transpile.ts
 * =================
 */
import { readFile, writeFile } from "node:fs/promises";
function isObject(o) {
  return Object.prototype.toString.call(o) === "[object Object]";
}
function sortObjectNested(data, sortArrays) {
  if (Array.isArray(data)) {
    const sorted = data.map((item) => sortObjectNested(item, sortArrays));
    if (sortArrays) {
      sorted.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return sorted;
  }
  if (isObject(data)) {
    return Object.fromEntries(
      Object.keys(data)
        .sort()
        .map((key) => [key, sortObjectNested(data[key], sortArrays)])
    );
  }
  return data;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function main() {
  const args = process.argv.slice(2);
  const sortArrays = args.includes("--array");
  const file = args.find((arg) => arg !== "--array");
  if (file) {
    const input = await readFile(file, "utf8");
    const sorted = sortObjectNested(JSON.parse(input), sortArrays);
    await writeFile(file, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  } else {
    const input = await readStdin();
    const sorted = sortObjectNested(JSON.parse(input), sortArrays);
    process.stdout.write(JSON.stringify(sorted, null, 2) + "\n");
  }
}
if (import.meta.main) {
  try {
    await main();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}
`);
    process.exit(1);
  }
}
export { sortObjectNested };
