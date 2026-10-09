import { requireEnv } from "./env.ts";

/**
 * Validates and retrieves Telegram credentials from environment variables.
 * Exits the process if any required variable is missing or empty.
 */
function getTelegramEnv(): { botToken: string; chatId: string } {
  const botToken = requireEnv("TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv("TELEGRAM_CHAT_ID");
  return { botToken, chatId };
}

/**
 * Sends a message to a Telegram chat using the Bot API.
 *
 * Supports MarkdownV2 formatting:
 *   *bold*        - bold text
 *   [text](url)   - inline link
 *   \- item       - list item (manual, Telegram has no native lists)
 *
 * @param text - Message text in MarkdownV2 format
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const { botToken, chatId } = getTelegramEnv();

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${body}`);
  }
}
