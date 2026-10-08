/**
 * Reads and validates PORT and HOST from environment variables,
 * then derives the final connectHost (replacing 0.0.0.0 with 127.0.0.1
 * so outgoing HTTP/WS requests bind to loopback instead of all interfaces).
 *
 * Throws immediately if PORT or HOST are missing, so callers can rely on
 * the returned values being defined strings.
 *
 * Usage:
 *   import { getEnv } from "./lib/env.ts";
 *   const { PORT, HOST, connectHost } = getEnv();
 */
export function getEnv(): { PORT: string; HOST: string; connectHost: string } {
  if (!process.env.PORT) {
    throw new Error(
      "PORT environment variable is required. Please set PORT in your .env file or environment.",
    );
  }
  if (!process.env.HOST) {
    throw new Error(
      "HOST environment variable is required. Please set HOST in your .env file or environment.",
    );
  }

  const PORT: string = process.env.PORT;
  const HOST: string = process.env.HOST;
  const connectHost: string = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;

  return { PORT, HOST, connectHost };
}
