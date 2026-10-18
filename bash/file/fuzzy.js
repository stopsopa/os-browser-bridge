/**
 * =================
 * Transpiled with transpile.ts
 * =================
 */
import fs from "node:fs";
import tty from "node:tty";
import readline from "node:readline";
import { execFile } from "node:child_process";
function fuzzyMatch(line, token) {
  if (token.length === 0) {
    return { indices: [], score: 0 };
  }
  const lowerLine = line.toLowerCase();
  const lowerToken = token.toLowerCase();
  const subIdx = lowerLine.indexOf(lowerToken);
  if (subIdx !== -1) {
    const indices2 = [];
    for (let i = 0; i < lowerToken.length; i++) {
      indices2.push(subIdx + i);
    }
    const score = 1e3 + subIdx * 2;
    return { indices: indices2, score };
  }
  let tIdx = 0;
  const indices = [];
  for (let i = 0; i < line.length && tIdx < lowerToken.length; i++) {
    if (lowerLine[i] === lowerToken[tIdx]) {
      indices.push(i);
      tIdx++;
    }
  }
  if (tIdx === lowerToken.length) {
    let score = 0;
    let prev = -2;
    for (let k = 0; k < indices.length; k++) {
      const idx = indices[k];
      if (idx === prev + 1) {
        score += 25;
      }
      if (idx === 0 || "/_.-".includes(line[idx - 1])) {
        score += 20;
      }
      if (line[idx] === token[k]) {
        score += 5;
      }
      prev = idx;
    }
    const span = indices[indices.length - 1] - indices[0];
    score -= span;
    score -= line.length * 0.1;
    return { indices, score };
  } else {
    return null;
  }
}
function matchLine(line, query) {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { indices: [], score: 0 };
  }
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  const combinedIndices = [];
  let totalScore = 0;
  for (const token of tokens) {
    const match = fuzzyMatch(line, token);
    if (match === null) {
      return null;
    }
    combinedIndices.push(...match.indices);
    totalScore += match.score;
  }
  return { indices: combinedIndices, score: totalScore };
}
function formatHighlightedLine(line, indices, isSelected) {
  const REVERSE = "\x1B[7m";
  const RESET_REVERSE = "\x1B[27m";
  const RESET = "\x1B[0m";
  const indexSet = new Set(indices);
  let highlighted = "";
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (indexSet.has(i)) {
      highlighted += `${REVERSE}${char}${RESET_REVERSE}`;
    } else {
      highlighted += char;
    }
  }
  if (isSelected) {
    const YELLOW = "\x1B[1;33m";
    return `${YELLOW}> ${highlighted}${RESET}`;
  } else {
    return `  ${highlighted}${RESET}`;
  }
}
async function readStdinLines() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  const lines = [];
  for await (const line of rl) {
    if (line.trim().length > 0) {
      lines.push(line.trim());
    }
  }
  return lines;
}
async function runDefaultFind() {
  return new Promise((resolve, reject) => {
    const args = [
      ".",
      "(",
      "-type",
      "d",
      "(",
      "-name",
      "node_modules",
      "-o",
      "-name",
      ".git",
      "-o",
      "-name",
      ".venv",
      ")",
      "-prune",
      ")",
      "-o",
      "(",
      "-type",
      "f",
      "-iname",
      "*.e2e*",
      "-print",
      ")",
    ];
    execFile("find", args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        const lines = stdout
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        resolve(lines);
      }
    });
  });
}
async function main() {
  let allLines = [];
  if (process.stdin.isTTY) {
    allLines = await runDefaultFind();
  } else {
    allLines = await readStdinLines();
  }
  if (allLines.length === 0) {
    process.stderr.write("fuzzy.ts error: input stream is empty\n");
    process.exit(1);
  }
  let ttyInFd;
  let ttyOutFd;
  try {
    ttyInFd = fs.openSync("/dev/tty", "r");
    ttyOutFd = fs.openSync("/dev/tty", "w");
  } catch (err) {
    process.stderr.write(
      `fuzzy.ts error: cannot open /dev/tty (${err instanceof Error ? err.message : String(err)})
`
    );
    process.exit(1);
  }
  const ttyIn = new tty.ReadStream(ttyInFd);
  const ttyOut = new tty.WriteStream(ttyOutFd);
  let query = "";
  let cursorIndex = 0;
  let selectedIndex = 0;
  let scrollOffset = 0;
  let renderedLineCount = 0;
  let filtered = [];
  function updateFiltered() {
    if (query.trim().length === 0) {
      filtered = allLines.map((line) => ({
        line,
        indices: [],
        score: 0,
      }));
    } else {
      const matches = [];
      for (const line of allLines) {
        const match = matchLine(line, query);
        if (match !== null) {
          matches.push({
            line,
            indices: match.indices,
            score: match.score,
          });
        }
      }
      matches.sort((a, b) => b.score - a.score);
      filtered = matches;
    }
  }
  function cleanupAndExit(selectedLine, exitCode) {
    let clearBuf = "";
    if (renderedLineCount > 0) {
      clearBuf += `\r\x1B[${renderedLineCount}A`;
      for (let i = 0; i < renderedLineCount; i++) {
        clearBuf += `\r\x1B[2K\r
`;
      }
      clearBuf += `\x1B[${renderedLineCount}A\r`;
    }
    clearBuf += "\x1B[?7h\x1B[?25h";
    ttyOut.write(clearBuf);
    try {
      ttyIn.setRawMode(false);
      ttyIn.pause();
      fs.closeSync(ttyInFd);
      fs.closeSync(ttyOutFd);
    } catch {}
    if (selectedLine !== null && exitCode === 0) {
      process.stdout.write(selectedLine, () => {
        process.exit(0);
      });
    } else {
      process.stderr.write("fuzzy.ts error: nothing selected\n");
      process.exit(1);
    }
  }
  function render() {
    const terminalHeight = ttyOut.rows || 24;
    const maxVisible = Math.max(3, Math.min(15, terminalHeight - 3));
    if (filtered.length === 0) {
      selectedIndex = 0;
    } else if (selectedIndex >= filtered.length) {
      selectedIndex = filtered.length - 1;
    } else if (selectedIndex < 0) {
      selectedIndex = 0;
    }
    if (cursorIndex < 0) {
      cursorIndex = 0;
    } else if (cursorIndex > query.length) {
      cursorIndex = query.length;
    }
    if (selectedIndex < scrollOffset) {
      scrollOffset = selectedIndex;
    } else if (selectedIndex >= scrollOffset + maxVisible) {
      scrollOffset = selectedIndex - maxVisible + 1;
    }
    const visibleItems = filtered.slice(scrollOffset, scrollOffset + maxVisible);
    const linesToRender = [];
    const countStr = ` (${filtered.length}/${allLines.length})`;
    let queryWithCursor = "";
    if (cursorIndex < query.length) {
      const before = query.slice(0, cursorIndex);
      const at = query[cursorIndex];
      const after = query.slice(cursorIndex + 1);
      queryWithCursor = `${before}\x1B[7m${at}\x1B[27m${after}`;
    } else {
      queryWithCursor = `${query}\x1B[7m \x1B[27m`;
    }
    linesToRender.push(`> ${queryWithCursor}\x1B[90m${countStr}\x1B[0m`);
    for (let i = 0; i < visibleItems.length; i++) {
      const itemIndex = scrollOffset + i;
      const isSelected = itemIndex === selectedIndex;
      const match = visibleItems[i];
      linesToRender.push(formatHighlightedLine(match.line, match.indices, isSelected));
    }
    if (visibleItems.length === 0) {
      linesToRender.push("  \x1B[90m(no matches)\x1B[0m");
    }
    let buf = "\x1B[?7l\x1B[?25l";
    if (renderedLineCount > 0) {
      buf += `\r\x1B[${renderedLineCount}A`;
    }
    for (let i = 0; i < linesToRender.length; i++) {
      buf += `\r\x1B[2K${linesToRender[i]}\r
`;
    }
    if (renderedLineCount > linesToRender.length) {
      const diff = renderedLineCount - linesToRender.length;
      for (let i = 0; i < diff; i++) {
        buf += "\r\x1B[2K\r\n";
      }
      buf += `\x1B[${diff}A`;
    }
    renderedLineCount = linesToRender.length;
    ttyOut.write(buf);
  }
  process.on("SIGINT", () => cleanupAndExit(null, 1));
  process.on("SIGTERM", () => cleanupAndExit(null, 1));
  ttyIn.setRawMode(true);
  ttyIn.resume();
  ttyIn.setEncoding("utf8");
  updateFiltered();
  render();
  ttyIn.on("data", (chunk) => {
    if (chunk === "") {
      cleanupAndExit(null, 1);
      return;
    }
    if (chunk === "") {
      cleanupAndExit(null, 1);
      return;
    }
    if (chunk === "\r" || chunk === "\n") {
      if (filtered.length > 0) {
        cleanupAndExit(filtered[selectedIndex].line, 0);
      } else {
        cleanupAndExit(null, 1);
      }
      return;
    }
    if (chunk === "\x7F" || chunk === "\b") {
      if (cursorIndex > 0) {
        query = query.slice(0, cursorIndex - 1) + query.slice(cursorIndex);
        cursorIndex -= 1;
        selectedIndex = 0;
        updateFiltered();
        render();
      }
      return;
    }
    if (chunk === "\x1B[3~") {
      if (cursorIndex < query.length) {
        query = query.slice(0, cursorIndex) + query.slice(cursorIndex + 1);
        selectedIndex = 0;
        updateFiltered();
        render();
      }
      return;
    }
    if (chunk === "\x1B[D" || chunk === "\x1BOD") {
      if (cursorIndex > 0) {
        cursorIndex -= 1;
        render();
      }
      return;
    }
    if (chunk === "\x1B[C" || chunk === "\x1BOC") {
      if (cursorIndex < query.length) {
        cursorIndex += 1;
        render();
      }
      return;
    }
    if (chunk === "\x1B[H" || chunk === "\x1B[1~" || chunk === "\x1B[7~" || chunk === "\x1BOH" || chunk === "") {
      cursorIndex = 0;
      render();
      return;
    }
    if (chunk === "\x1B[F" || chunk === "\x1B[4~" || chunk === "\x1B[8~" || chunk === "\x1BOF" || chunk === "") {
      cursorIndex = query.length;
      render();
      return;
    }
    if (chunk === "\x1B[A" || chunk === "\x1BOA" || chunk === "") {
      if (filtered.length > 0) {
        selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
        render();
      }
      return;
    }
    if (chunk === "\x1B[B" || chunk === "\x1BOB" || chunk === "") {
      if (filtered.length > 0) {
        selectedIndex = (selectedIndex + 1) % filtered.length;
        render();
      }
      return;
    }
    if (chunk === "\x1B[5~") {
      if (filtered.length > 0) {
        selectedIndex = Math.max(0, selectedIndex - 5);
        render();
      }
      return;
    }
    if (chunk === "\x1B[6~") {
      if (filtered.length > 0) {
        selectedIndex = Math.min(filtered.length - 1, selectedIndex + 5);
        render();
      }
      return;
    }
    if (chunk === "\x1B") {
      cleanupAndExit(null, 1);
      return;
    }
    if (chunk === "") {
      query = "";
      cursorIndex = 0;
      selectedIndex = 0;
      updateFiltered();
      render();
      return;
    }
    if (chunk === "") {
      if (cursorIndex > 0) {
        const before = query.slice(0, cursorIndex);
        const after = query.slice(cursorIndex);
        const trimmed = before.trimEnd();
        const lastSpace = trimmed.lastIndexOf(" ");
        const newBefore = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : "";
        cursorIndex = newBefore.length;
        query = newBefore + after;
        selectedIndex = 0;
        updateFiltered();
        render();
      }
      return;
    }
    if (chunk.startsWith("\x1B")) {
      return;
    }
    if (chunk.charCodeAt(0) >= 32 && chunk.charCodeAt(0) !== 127) {
      query = query.slice(0, cursorIndex) + chunk + query.slice(cursorIndex);
      cursorIndex += chunk.length;
      selectedIndex = 0;
      updateFiltered();
      render();
    }
  });
}
try {
  await main();
} catch (err) {
  process.stderr.write(`fuzzy.ts error: ${err instanceof Error ? err.message : String(err)}
`);
  process.exit(1);
}
