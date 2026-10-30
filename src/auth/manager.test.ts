/**
 * Tests for credential types and auth manager.
 */
import { describe, it, expect } from "bun:test";
import { credentialString, isExpired } from "./types.js";
import { AuthManager } from "./manager.js";

describe("credentialString", () => {
  it("returns apiKey.secret when secret present", () => {
    expect(credentialString({ apiKey: "a", secret: "b", provider: "zai" })).toBe("a.b");
  });

  it("returns apiKey only when secret absent", () => {
    expect(credentialString({ apiKey: "abc", provider: "zai" })).toBe("abc");
  });
});

describe("isExpired", () => {
  it("returns false when expiresAt is undefined", () => {
    expect(isExpired({ apiKey: "x", provider: "zai" })).toBe(false);
  });

  it("returns true when past expiry", () => {
    const cred = { apiKey: "x", provider: "zai" as const, expiresAt: 1000 };
    expect(isExpired(cred, 2000)).toBe(true);
  });

  it("returns false when before expiry", () => {
    const cred = { apiKey: "x", provider: "zai" as const, expiresAt: 3000 };
    expect(isExpired(cred, 2000)).toBe(false);
  });
});

describe("AuthManager", () => {
  it("throws without a credential", async () => {
    const mgr = new AuthManager();
    expect(mgr.getCredential()).rejects.toThrow(/not available/);
  });

  it("returns the credential set via setOAuthCredential", async () => {
    const mgr = new AuthManager();
    mgr.setOAuthCredential({ apiKey: "oa", secret: "sc", provider: "zai" });
    const cred = await mgr.getCredential();
    expect(cred.apiKey).toBe("oa");
    expect(cred.secret).toBe("sc");
  });

  it("returns the latest credential after re-set", async () => {
    const mgr = new AuthManager();
    mgr.setOAuthCredential({ apiKey: "old", provider: "zai" });
    mgr.setOAuthCredential({ apiKey: "new", provider: "zai" });
    const cred = await mgr.getCredential();
    expect(cred.apiKey).toBe("new");
  });

  it("throws on an expired credential and clears it", async () => {
    const mgr = new AuthManager();
    mgr.setOAuthCredential({ apiKey: "x", provider: "zai", expiresAt: 1000 });
    await expect(mgr.getCredential()).rejects.toThrow(/expired/);
    await expect(mgr.getCredential()).rejects.toThrow(/not available/);
  });

  it("drops the credential on clearOAuthCredential", async () => {
    const mgr = new AuthManager();
    mgr.setOAuthCredential({ apiKey: "oa", provider: "zai" });
    mgr.clearOAuthCredential();
    await expect(mgr.getCredential()).rejects.toThrow(/not available/);
  });

  it("accepts a fresh credential after clearOAuthCredential", async () => {
    const mgr = new AuthManager();
    mgr.setOAuthCredential({ apiKey: "old", provider: "zai" });
    mgr.clearOAuthCredential();
    mgr.setOAuthCredential({ apiKey: "new", provider: "zai" });
    expect((await mgr.getCredential()).apiKey).toBe("new");
  });
});

describe("multi-account rotation", () => {
  const a = { apiKey: "A", provider: "zai" } as const;
  const b = { apiKey: "B", provider: "zai" } as const;

  it("prefers the active account, then falls to the next usable one", async () => {
    const mgr = new AuthManager();
    mgr.setPool([
      { id: "user:a", credential: { ...a } },
      { id: "user:b", credential: { ...b } },
    ], "user:a");
    expect((await mgr.getCredential()).apiKey).toBe("A");
    mgr.markExhausted("user:a");
    expect((await mgr.getCredential()).apiKey).toBe("B");
  });

  it("throws quota_exhausted when every account is marked", async () => {
    const mgr = new AuthManager();
    mgr.setPool([{ id: "user:a", credential: { ...a } }], "user:a");
    mgr.markExhausted("user:a");
    await expect(mgr.getCredential()).rejects.toThrow(/quota_exhausted/);
  });

  it("exhaustion expires after the cooldown lapses", async () => {
    const mgr = new AuthManager();
    mgr.setPool([{ id: "user:a", credential: { ...a } }], "user:a");
    mgr.markExhausted("user:a", Date.now() - 1);
    expect((await mgr.getCredential()).apiKey).toBe("A");
    expect(mgr.isExhausted("user:a")).toBe(false);
  });

  it("clearExhausted revives an account early", async () => {
    const mgr = new AuthManager();
    mgr.setPool([{ id: "user:a", credential: { ...a } }], "user:a");
    mgr.markExhausted("user:a");
    mgr.clearExhausted("user:a");
    expect((await mgr.getCredential()).apiKey).toBe("A");
  });

  it("nextAccountId walks the pool skipping exhausted ids", () => {
    const mgr = new AuthManager();
    mgr.setPool([
      { id: "user:a", credential: { ...a } },
      { id: "user:b", credential: { ...b } },
    ], "user:a");
    expect(mgr.nextAccountId("user:a")).toBe("user:b");
    mgr.markExhausted("user:b");
    expect(mgr.nextAccountId("user:a")).toBe("user:a");
    expect(mgr.nextAccountId("user:nope")).toBe("user:a");
  });

  it("reloadFromStore pulls the on-disk pool", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "zcode-mgr-test-"));
    const prev = process.env.ZCODE_PROXY_STORE_DIR;
    process.env.ZCODE_PROXY_STORE_DIR = dir;
    try {
      const mgr = new AuthManager();
      mgr.setPool([{ id: "user:x", credential: { ...a } }], "user:x");
      // Empty temp store → pool empties without throwing.
      await mgr.reloadFromStore();
      expect(mgr.accountIds()).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.ZCODE_PROXY_STORE_DIR;
      else process.env.ZCODE_PROXY_STORE_DIR = prev;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
