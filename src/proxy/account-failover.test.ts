/**
 * Tests for multi-account failover: exhaustion detection + in-request retry.
 */
import { describe, it, expect, mock } from "bun:test";
import { isExhaustionResponse, exhaustionCooldownMs } from "./account-failover.js";
import { proxyRequest } from "./handler.js";
import type { ProxyConfig, ProxyIdentity } from "../config/types.js";
import { AuthManager } from "../auth/manager.js";

const IDENTITY: ProxyIdentity = {
  appVersion: "test-1.0.0",
  sourceTitle: "cli",
  refererOrigin: "https://zcode.z.ai",
};

const TEST_CONFIG: ProxyConfig = {
  server: { port: 8080, host: "0.0.0.0" },
  auth: {},
  provider: "zai",
  plan: "coding-plan",
  providers: {
    zai: { anthropicBase: "https://api.z.ai/api/anthropic", openaiBase: "https://api.z.ai/api/coding/paas/v4" },
  },
  defaultModel: "glm-4.6",
  models: ["glm-4.6"],
  identity: IDENTITY,
  clientIdentity: { mode: "observe", ttlSeconds: 900, maxSessions: 1024 },
  responses: { enabled: true, storeMaxEntries: 1000, storeTtlMs: 86400000 },
  endpointRouting: { enabled: false, origin: "https://zcode.z.ai" },
  clientSigning: { enabled: false },
  highspeed: { enabled: false, origin: "https://zcode.z.ai", models: [] },
  mcp: { enabled: true, webSearch: true, webReader: false, zread: false, gateway: { enabled: true, upstreamOrigin: "https://zcode.chatglm.site" } },
  async: { enabled: false, origin: "https://zcode.z.ai", pollIntervalMs: 5000, keepAliveIntervalMs: 3000, maxWaitMs: 0, maxRetries: 3, settleTimeoutMs: 8000, controlTimeoutMs: 15000, defaultModel: "" },
  claim: { enabled: false, auto: false, origin: "https://zcode.z.ai", pollIntervalMs: 300000, cooldownMs: 600000, planId: "" },
  logging: { level: "info" },
};

const ANTHROPIC_OK = JSON.stringify({
  id: "msg_failover",
  type: "message",
  role: "assistant",
  model: "glm-4.6",
  content: [{ type: "text", text: "second account reply" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 5, output_tokens: 3 },
});

function clientReq(): Request {
  return new Request("http://localhost:8080/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"model":"glm-4.6","messages":[{"role":"user","content":"hi"}]}',
  });
}

describe("isExhaustionResponse", () => {
  it("treats 429 and 402 as exhaustion without reading the body", async () => {
    expect(await isExhaustionResponse(new Response("{}", { status: 429 }))).toBe(true);
    expect(await isExhaustionResponse(new Response("{}", { status: 402 }))).toBe(true);
  });

  it("treats 400 with insufficient-balance markers as exhaustion", async () => {
    const r = new Response(JSON.stringify({ error: { message: "insufficient balance, please recharge" } }), { status: 400 });
    expect(await isExhaustionResponse(r)).toBe(true);
  });

  it("ignores unrelated 400s (e.g. captcha challenge, validation)", async () => {
    const captcha = new Response(JSON.stringify({ code: 3007, msg: "captcha verify failed" }), { status: 400 });
    expect(await isExhaustionResponse(captcha)).toBe(false);
    const bad = new Response(JSON.stringify({ error: { message: "invalid request: unknown field" } }), { status: 400 });
    expect(await isExhaustionResponse(bad)).toBe(false);
  });

  it("ignores success and unrelated statuses", async () => {
    expect(await isExhaustionResponse(new Response("{}", { status: 200 }))).toBe(false);
    expect(await isExhaustionResponse(new Response("{}", { status: 401 }))).toBe(false);
    expect(await isExhaustionResponse(new Response("{}", { status: 500 }))).toBe(false);
  });
});

describe("exhaustionCooldownMs", () => {
  it("uses a short cooldown for 429 and a long one otherwise", () => {
    expect(exhaustionCooldownMs(429)).toBeLessThan(exhaustionCooldownMs(402));
  });
});

describe("proxyRequest — multi-account failover", () => {
  it("retries an exhausted account on the next logged-in account", async () => {
    let calls = 0;
    const seenKeys: (string | null)[] = [];
    const fetchMock = mock(async (req: Request): Promise<Response> => {
      calls += 1;
      seenKeys.push(req.headers.get("x-api-key") ?? req.headers.get("authorization"));
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: "insufficient balance" } }), {
          status: 400, headers: { "content-type": "application/json" },
        });
      }
      return new Response(ANTHROPIC_OK, { status: 200, headers: { "content-type": "application/json" } });
    });

    const auth = new AuthManager();
    auth.setPool([
      { id: "user:aaa", credential: { apiKey: "KEY_A_FOR_TEST", provider: "zai", userId: "aaa" } },
      { id: "user:bbb", credential: { apiKey: "KEY_B_FOR_TEST", provider: "zai", userId: "bbb" } },
    ], "user:aaa");

    const resp = await proxyRequest(clientReq(), "openai", { config: TEST_CONFIG, auth, fetchImpl: fetchMock as any });
    expect(calls).toBe(2);
    expect(String(seenKeys[0])).toContain("KEY_A_FOR_TEST");
    expect(String(seenKeys[1])).toContain("KEY_B_FOR_TEST");
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.choices[0].message.content).toBe("second account reply");
    // First account marked exhausted; traffic now prefers the second.
    expect(auth.isExhausted("user:aaa")).toBe(true);
    expect(auth.currentAccountId()).toBe("user:bbb");
  });

  it("returns the exhaustion response when no other account exists", async () => {
    const fetchMock = mock(async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: "insufficient balance" } }), {
        status: 400, headers: { "content-type": "application/json" },
      }),
    );
    const auth = new AuthManager();
    auth.setPool([{ id: "user:only", credential: { apiKey: "KEY_ONLY_FOR_TEST", provider: "zai", userId: "only" } }], "user:only");
    const resp = await proxyRequest(clientReq(), "openai", { config: TEST_CONFIG, auth, fetchImpl: fetchMock as any });
    expect(resp.status).toBe(400);
  });
});
