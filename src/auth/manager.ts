/**
 * Auth manager — multi-account credential pool for proxied requests.
 *
 * Holds one in-memory credential per account (keyed by account id) plus an
 * exhaustion map: accounts whose upstream quota ran out are skipped until
 * their cooldown lapses, so traffic automatically fails over to the next
 * logged-in account. The active account id mirrors the store; rotation only
 * changes the in-memory pick, never the stored active account.
 */
import type { Credential } from "./types.js";
import { accountIdFor, listAccounts } from "./store.js";

/** Default exhaustion cooldown when no reset time is known (10 minutes). */
export const DEFAULT_EXHAUSTION_COOLDOWN_MS = 10 * 60 * 1000;

export class AuthManager {
  private creds = new Map<string, Credential>();
  private activeId: string | null = null;
  private exhaustedUntil = new Map<string, number>();

  /**
   * Returns the active account's credential, falling over to the next
   * usable account when the active one is exhausted or expired.
   * Throws when the pool is empty.
   */
  async getCredential(): Promise<Credential> {
    this.pruneExhausted();
    const ids = [...this.creds.keys()];
    if (ids.length === 0) {
      throw new Error("OAuth credential not available — run: zcode-proxy auth login");
    }
    const ordered = this.activeId && this.creds.has(this.activeId)
      ? [this.activeId, ...ids.filter((id) => id !== this.activeId)]
      : ids;
    let sawExpired = false;
    for (const id of ordered) {
      const cred = this.creds.get(id)!;
      if (cred.expiresAt && Date.now() >= cred.expiresAt) {
        this.creds.delete(id);
        this.exhaustedUntil.delete(id);
        sawExpired = true;
        continue;
      }
      if (this.isExhausted(id)) continue;
      return cred;
    }
    if (sawExpired && ordered.length > 0 && this.creds.size === 0) {
      throw new Error("OAuth credential expired; re-authentication required — run: zcode-proxy auth login");
    }
    if (ordered.length > 0) {
      throw new Error("quota_exhausted: every logged-in account is out of quota — wait for reset or add another account");
    }
    throw new Error("OAuth credential not available — run: zcode-proxy auth login");
  }

  /** Account id backing the credential `getCredential()` would return now. */
  currentAccountId(): string | null {
    this.pruneExhausted();
    if (this.activeId && this.creds.has(this.activeId) && !this.isExhausted(this.activeId)) {
      return this.activeId;
    }
    for (const id of this.creds.keys()) {
      if (!this.isExhausted(id)) return id;
    }
    return null;
  }

  /** All in-memory account ids (active first). */
  accountIds(): string[] {
    const ids = [...this.creds.keys()];
    if (this.activeId && this.creds.has(this.activeId)) {
      return [this.activeId, ...ids.filter((id) => id !== this.activeId)];
    }
    return ids;
  }

  /** Credential for one account id, if present. */
  credentialFor(id: string): Credential | undefined {
    return this.creds.get(id);
  }

  /** Load (or reload) the pool — used at startup and after login/logout. */
  setPool(accounts: { id: string; credential: Credential }[], activeId: string | null): void {
    this.creds = new Map(accounts.map((a) => [a.id, a.credential]));
    this.activeId = activeId && this.creds.has(activeId) ? activeId : (accounts[0]?.id ?? null);
    for (const id of [...this.exhaustedUntil.keys()]) {
      if (!this.creds.has(id)) this.exhaustedUntil.delete(id);
    }
    this.pruneExhausted();
  }

  /** Re-read the on-disk pool into memory (login/logout/account switch). */
  async reloadFromStore(): Promise<void> {
    const accounts = await listAccounts().catch(() => []);
    this.setPool(
      accounts.map((a) => ({ id: a.id, credential: a.credential })),
      accounts[0]?.id ?? null,
    );
  }

  /** Set the OAuth credential (used by the `auth login` flow). */
  setOAuthCredential(cred: Credential): void {
    const id = accountIdFor(cred);
    this.creds.set(id, cred);
    this.activeId = id;
    this.exhaustedUntil.delete(id);
  }

  /**
   * Drop the in-memory credential without touching the store.
   *
   * Used when the user logs out while the process keeps running (the `serve`
   * web panel): this manager is consulted before the store, so a credential
   * that is already gone from disk would otherwise keep being spent by `/v1`
   * requests and by auto-claim.
   */
  clearOAuthCredential(): void {
    this.creds.clear();
    this.activeId = null;
    this.exhaustedUntil.clear();
  }

  /** Mark one account's quota as exhausted; traffic skips it until `until`. */
  markExhausted(id: string, until: number = Date.now() + DEFAULT_EXHAUSTION_COOLDOWN_MS): void {
    if (this.creds.has(id)) this.exhaustedUntil.set(id, until);
  }

  /** Clear an exhaustion mark early (fresh quota observed). */
  clearExhausted(id: string): void {
    this.exhaustedUntil.delete(id);
  }

  /** True when the account is currently skipped for exhaustion. */
  isExhausted(id: string): boolean {
    const until = this.exhaustedUntil.get(id);
    if (until === undefined) return false;
    if (until <= Date.now()) {
      this.exhaustedUntil.delete(id);
      return false;
    }
    return true;
  }

  /** Next usable account after `fromId` (round-robin order), or null. */
  nextAccountId(fromId?: string): string | null {
    this.pruneExhausted();
    const usable = [...this.creds.keys()].filter((id) => !this.isExhausted(id));
    if (usable.length === 0) return null;
    if (!fromId) return usable[0]!;
    const idx = usable.indexOf(fromId);
    if (idx < 0) return usable[0]!;
    return usable[(idx + 1) % usable.length]!;
  }

  private pruneExhausted(): void {
    const now = Date.now();
    for (const [id, until] of this.exhaustedUntil) {
      if (until <= now) this.exhaustedUntil.delete(id);
    }
  }
}
