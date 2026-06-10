import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/**
 * Lazy Anthropic client — constructed on first use so env vars loaded
 * after module import (e.g. by dotenv in scripts) still take effect.
 */
function getClient(): Anthropic {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local or your environment.",
    );
  }
  // A review runs for minutes across dozens of calls — ride out transient
  // 429/5xx/connection errors rather than failing the whole pipeline.
  _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 });
  return _client;
}

/**
 * Proxy that forwards to a lazily-instantiated Anthropic client. Callers
 * can continue to use `anthropic.messages.create(...)` without caring
 * about init order.
 */
export const anthropic: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Model IDs — see stack_decision memory. */
export const Models = {
  /** Fast, high-quality extraction and letter drafting */
  Sonnet: "claude-sonnet-4-6",
  /** Highest reasoning — final compliance/risk pass */
  Opus: "claude-opus-4-6",
} as const;
