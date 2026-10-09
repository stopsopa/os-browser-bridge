/**
 * node --env-file .env telegram-test.ts
 */

import { sendTelegramMessage } from "./automation/lib/telegram.ts";

/*
 * Example of a MarkdownV2 formatted message:
 *
 *   *bold text*         - bold
 *   [link text](url)    - inline link
 *   \- item             - list item (escaped dash)
 *
 * Note: In MarkdownV2 special chars like . ! ( ) - must be escaped with backslash.
 */
const message = [
  "*Hello from PlaywrightMotBot\\!*",
  "",
  "Check out the Telegram Bot API: [Telegram Bot API](https://core\\.telegram\\.org/bots/api)",
  "",
  "Shopping list:",
  "\\- Apples",
  "\\- Bananas",
  "\\- Oranges",
].join("\n");

await sendTelegramMessage(message);

console.log("Message sent successfully.");
