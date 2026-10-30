/**
 * Multi-account failover signals.
 *
 * When the active account's quota runs out, the upstream rejects the request
 * instead of serving it. The proxy detects that rejection, marks the account
 * exhausted (so later requests skip it until the cooldown lapses), and the
 * handler retries the same request with the next logged-in account — before
 * anything is streamed to the client.
 */

/** Cooldown for rate-limit style rejections (likely transient). */
export const RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
/** Cooldown when the quota is actually spent (refills on upstream reset). */
export const QUOTA_SPENT_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * True when the upstream response means "this account cannot serve this
 * request right now": 429 / 402 outright, or 400/403 carrying an
 * insufficient-balance/quota marker in the body. Reads via a clone so the
 * caller can still forward or retry with the original response.
 */
export async function isExhaustionResponse(resp: Response): Promise<boolean> {
  if (resp.status === 429 || resp.status === 402) return true;
  if (resp.status !== 400 && resp.status !== 403) return false;
  let text: string;
  try {
    text = await resp.clone().text();
  } catch {
    return false;
  }
  if (text.length === 0 || text.length > 8192) return false;
  const t = text.toLowerCase();
  return (
    t.includes("insufficient") ||
    (t.includes("quota") && (t.includes("exceed") || t.includes("exhaust") || t.includes("deplet") || t.includes("empty"))) ||
    t.includes("out of credit") ||
    (t.includes("balance") && (t.includes("not enough") || t.includes("insufficient") || t.includes("empty") || t.includes("zero"))) ||
    t.includes("billing") && t.includes("unavailable")
  );
}

/** Cooldown to attach to an exhausted account, by rejection status. */
export function exhaustionCooldownMs(status: number): number {
  return status === 429 ? RATE_LIMIT_COOLDOWN_MS : QUOTA_SPENT_COOLDOWN_MS;
}
