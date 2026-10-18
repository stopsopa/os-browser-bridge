/**
 * =================
 * Transpiled with transpile.ts
 * =================
 */
import fs from "node:fs/promises";
import readline from "node:readline";
const [gitignoreFile, sectionName] = process.argv.slice(2);
if (!gitignoreFile || !sectionName) {
  console.error("Usage: node addToGitignore.ts <gitignore-file> <section-name>");
  process.exit(1);
}
const startMarker = `# ${sectionName} vvv`;
const endMarker = `# ${sectionName} ^^^`;
const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});
async function updateGitignore(line) {
  const content = await fs.readFile(gitignoreFile, "utf8");
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Cannot find section "${sectionName}" in ${gitignoreFile}`);
  }
  const sectionStart = start + startMarker.length;
  const before = content.slice(0, sectionStart);
  const section = content.slice(sectionStart, end);
  const after = content.slice(end);
  const entries = section
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (entries.includes(line.trim())) {
    return false;
  }
  entries.push(line.trim());
  entries.sort((a, b) => a.localeCompare(b));
  const newContent = before + "\n" + entries.join("\n") + "\n" + after;
  await fs.writeFile(gitignoreFile, newContent);
  return true;
}
for await (const line of rl) {
  const changed = await updateGitignore(line);
  process.stdout.write(line + "\n");
}
