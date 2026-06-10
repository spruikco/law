/**
 * Application-level retry for model calls. The SDK already retries
 * transport-level failures (429/5xx/connection resets); this covers the
 * failures it can't see — e.g. the model not calling a required tool, or
 * returning output that fails schema validation.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { label: string; attempts?: number; baseDelayMs?: number } = { label: "anthropic" },
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts) break;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.warn(
        `[retry] ${opts.label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms:`,
        err instanceof Error ? err.message : err,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
