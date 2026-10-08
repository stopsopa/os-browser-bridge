/**
 * Helper to retrieve server connection environment variables.
 */
export function getEnv(): { PORT: string | number; connectHost: string } {
  const PORT = process.env.PORT || 4364;
  const HOST = process.env.HOST || "127.0.0.1";
  const connectHost = HOST === "0.0.0.0" ? "127.0.0.1" : HOST;
  return { PORT, connectHost };
}

/**
 * Helper to retrieve and validate required environment variables.
 * Exits the process if the environment variable is missing or empty.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Error: ${name} environment variable is required and cannot be empty.`);
    process.exit(1);
  }
  return value;
}
