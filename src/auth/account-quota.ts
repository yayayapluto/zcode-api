/**
 * Proactive multi-account quota watcher.
 *
 * Reactive failover (upstream rejects → next account) covers hard cutoffs,
 * but an account can sit at zero balance while upstream still answers 200s
 * for a while. This watcher snapshots every stored account on an interval and
 * marks zero-balance accounts exhausted until the next check, so
 * `AuthManager.getCredential()` skips them up front.
 */
import type { ProxyConfig } from "../config/types.js";
import type { QuotaSnapshot } from "../server/routes-quota.js";
import { collectQuotaSnapshot } from "../server/routes-quota.js";
import type { AuthManager } from "./manager.js";

/** How often each account's quota is re-snapshotted (5 minutes). */
export const ACCOUNT_QUOTA_POLL_MS = 5 * 60 * 1000;

/** True when the snapshot shows no spendable quota anywhere. */
export function isQuotaEmpty(snap: QuotaSnapshot): boolean {
  const balances = snap.balances ?? [];
  const limits = snap.codingPlan?.limits ?? [];
  if (balances.length === 0 && limits.length === 0) return false;
  const balancesEmpty = balances.length > 0 && balances.every((b) => (b.remainingUnits ?? 0) <= 0);
  const limitsEmpty = limits.length > 0 && limits.every((l) => (l.remaining ?? 0) <= 0);
  if (balances.length > 0 && limits.length > 0) return balancesEmpty && limitsEmpty;
  if (balances.length > 0) return balancesEmpty;
  return limitsEmpty;
}

/** Snapshot every pooled account once; mark empty ones exhausted. */
export async function refreshAccountQuotas(
  auth: AuthManager,
  config: ProxyConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  for (const id of auth.accountIds()) {
    const cred = auth.credentialFor(id);
    if (!cred) continue;
    let snap: QuotaSnapshot;
    try {
      snap = await collectQuotaSnapshot(config, fetchImpl, async () => cred);
    } catch {
      continue; // offline / upstream hiccup — leave marks untouched
    }
    if (isQuotaEmpty(snap)) {
      auth.markExhausted(id, Date.now() + ACCOUNT_QUOTA_POLL_MS * 2);
    } else {
      auth.clearExhausted(id);
    }
  }
}

/** Run `refreshAccountQuotas` now and every `ACCOUNT_QUOTA_POLL_MS`. */
export function startAccountQuotaWatcher(
  auth: AuthManager,
  config: ProxyConfig,
  fetchImpl: typeof fetch = fetch,
): { stop: () => void } {
  void refreshAccountQuotas(auth, config, fetchImpl);
  const timer = setInterval(() => {
    void refreshAccountQuotas(auth, config, fetchImpl);
  }, ACCOUNT_QUOTA_POLL_MS);
  if (typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer) };
}
