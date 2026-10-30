/**
 * Tests for the proactive account quota watcher (multi-account failover).
 */
import { describe, it, expect } from "bun:test";
import { isQuotaEmpty, refreshAccountQuotas } from "./account-quota.js";
import { AuthManager } from "./manager.js";
import type { QuotaSnapshot } from "../server/routes-quota.js";

function snap(
  balances: Array<{ remainingUnits: number }> = [],
  limits: Array<{ remaining?: number }> = [],
): QuotaSnapshot {
  return {
    provider: "zai",
    serverTime: Date.now(),
    jwt: null,
    balances: balances.map((b, i) => ({
      showName: `pack-${i}`,
      remainingUnits: b.remainingUnits,
      totalUnits: 100,
      usedUnits: 100 - b.remainingUnits,
    })),
    claimablePlans: [],
    codingPlan: limits.length > 0 ? { level: "max", limits: limits.map((l) => ({ type: "TOKENS_LIMIT", ...l })) } : null,
    errors: [],
  };
}

describe("isQuotaEmpty", () => {
  it("is not empty when balance remains", () => {
    expect(isQuotaEmpty(snap([{ remainingUnits: 10 }]))).toBe(false);
  });

  it("is empty when every balance is spent", () => {
    expect(isQuotaEmpty(snap([{ remainingUnits: 0 }, { remainingUnits: 0 }]))).toBe(true);
  });

  it("is not empty when a coding-plan window still has room", () => {
    expect(isQuotaEmpty(snap([{ remainingUnits: 0 }], [{ remaining: 5 }]))).toBe(false);
  });

  it("is empty when balances and windows are all spent", () => {
    expect(isQuotaEmpty(snap([{ remainingUnits: 0 }], [{ remaining: 0 }]))).toBe(true);
  });

  it("treats a fully failed snapshot as unknown (never empty)", () => {
    expect(isQuotaEmpty(snap())).toBe(false);
  });

  it("is empty for a balance-only account at zero", () => {
    expect(isQuotaEmpty(snap([{ remainingUnits: 0 }]))).toBe(true);
  });
});

describe("refreshAccountQuotas", () => {
  const TEST_CONFIG = {
    server: { port: 8080, host: "127.0.0.1" },
    auth: {},
    provider: "zai",
    plan: "coding-plan",
    providers: {
      zai: { anthropicBase: "https://api.z.ai/api/anthropic", openaiBase: "https://api.z.ai/api/coding/paas/v4" },
    },
    defaultModel: "glm-4.6",
    models: ["glm-4.6"],
    identity: { appVersion: "test-1.0.0", sourceTitle: "cli", refererOrigin: "https://zcode.z.ai" },
    clientIdentity: { mode: "observe", ttlSeconds: 900, maxSessions: 1024 },
    responses: { enabled: false, storeMaxEntries: 100, storeTtlMs: 1000 },
    endpointRouting: { enabled: false, origin: "https://zcode.z.ai" },
    clientSigning: { enabled: false },
    highspeed: { enabled: false, origin: "https://zcode.z.ai", models: [] },
    mcp: { enabled: false, webSearch: false, webReader: false, zread: false, gateway: { enabled: false, upstreamOrigin: "" } },
    async: { enabled: false, origin: "", pollIntervalMs: 0, keepAliveIntervalMs: 0, maxWaitMs: 0, maxRetries: 0, settleTimeoutMs: 0, controlTimeoutMs: 0, defaultModel: "" },
    claim: { enabled: false, auto: false, origin: "https://zcode.z.ai", pollIntervalMs: 0, cooldownMs: 0, planId: "" },
    logging: { level: "info" },
  } as const;

  it("marks empty accounts and revives refilled ones", async () => {
    const auth = new AuthManager();
    auth.setPool([
      { id: "user:empty", credential: { apiKey: "E", provider: "zai" } },
      { id: "user:full", credential: { apiKey: "F", provider: "zai" } },
    ], "user:empty");
    auth.markExhausted("user:full"); // stale mark — refilled quota must clear it

    const fetchMock = (async (input: unknown, init?: { headers?: Record<string, string> }): Promise<Response> => {
      const url = String(input);
      if (!url.includes("/api/monitor/usage/quota/limit")) {
        return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 });
      }
      const key = init?.headers?.["authorization"] ?? "";
      const remaining = key === "F" ? 5 : 0;
      return new Response(JSON.stringify({
        code: 0,
        data: { level: "max", limits: [{ type: "TOKENS_LIMIT", number: 100, usage: 100 - remaining, remaining }] },
      }), { status: 200 });
    }) as typeof fetch;

    await refreshAccountQuotas(auth, TEST_CONFIG as never, fetchMock);
    expect(auth.isExhausted("user:empty")).toBe(true);
    expect(auth.isExhausted("user:full")).toBe(false);
    expect(auth.currentAccountId()).toBe("user:full");
  });

  it("leaves marks untouched when upstream is unreachable", async () => {
    const auth = new AuthManager();
    auth.setPool([{ id: "user:solo", credential: { apiKey: "S", provider: "zai" } }], "user:solo");
    const failing = (async (): Promise<Response> => { throw new Error("offline"); }) as unknown as typeof fetch;
    await refreshAccountQuotas(auth, TEST_CONFIG as never, failing);
    expect(auth.isExhausted("user:solo")).toBe(false);
  });
});
