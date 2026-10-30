import { describe, it, expect } from "bun:test";
import {
  createControlDispatcher,
  LogBuffer,
  type ControlState,
  type ControlResponse,
  type HandlerContext,
} from "./control.js";
import type { OAuthFlowClient, OAuthFlowStart, OAuthFlowTokens } from "../auth/oauth.js";

async function dispatch(
  cmd: { cmd: string; [k: string]: unknown },
  state: ControlState,
  ctx?: HandlerContext,
): Promise<ControlResponse> {
  const fullCtx: HandlerContext = { logBuffer: new LogBuffer(), ...ctx };
  return createControlDispatcher(state, fullCtx)(
    cmd as Parameters<ReturnType<typeof createControlDispatcher>>[0],
  );
}

describe("control dispatcher — status", () => {
  it("returns running status for {cmd:status}", async () => {
    const state: ControlState = {
      provider: "zai",
      plan: "coding-plan",
      proxyPort: 8080,
    };
    const result = await dispatch({ cmd: "status" }, state);
    expect(result.ok).toBe(true);
    if (result.ok && "state" in result) {
      expect(result.state).toBe("running");
      expect(result.provider).toBe("zai");
      expect(result.plan).toBe("coding-plan");
      expect(result.proxyPort).toBe(8080);
    }
  });

  it("returns error for unknown cmd", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const result = await dispatch({ cmd: "bogus" }, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unknown_cmd");
    }
  });
});

describe("control dispatcher — lifecycle commands", () => {
  it("startProxy calls hook and updates state.proxyPort", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onStartProxy: async () => ({ ok: true, port: 9999 }),
    };
    const result = await dispatch({ cmd: "startProxy" }, state, ctx);
    expect(result.ok).toBe(true);
    if (result.ok && "port" in result) {
      expect(result.port).toBe(9999);
    }
    expect(state.proxyPort).toBe(9999);
  });

  it("startProxy surfaces hook errors", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onStartProxy: async () => ({ ok: false, error: "not_logged_in" }),
    };
    const result = await dispatch({ cmd: "startProxy" }, state, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_logged_in");
    }
  });

  it("startProxy returns error when hook missing", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const result = await dispatch({ cmd: "startProxy" }, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("proxy_lifecycle_unavailable");
    }
  });

  it("stopProxy resets state.proxyPort to 0", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 8080 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onStopProxy: async () => ({ ok: true }),
    };
    const result = await dispatch({ cmd: "stopProxy" }, state, ctx);
    expect(result.ok).toBe(true);
    expect(state.proxyPort).toBe(0);
  });
});

describe("control dispatcher — setConfig", () => {
  it("updates provider and plan via hook and syncs state", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onSetConfig: async (changes) => ({
        ok: true,
        provider: changes.provider ?? state.provider,
        plan: changes.plan ?? state.plan,
      }),
    };
    const result = await dispatch({ cmd: "setConfig", provider: "zai", plan: "start-plan" }, state, ctx);
    expect(result.ok).toBe(true);
    if (result.ok && "plan" in result) {
      expect(result.provider).toBe("zai");
      expect(result.plan).toBe("start-plan");
    }
    expect(state.provider).toBe("zai");
    expect(state.plan).toBe("start-plan");
  });

  it("returns config_update_unavailable when hook missing", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const result = await dispatch({ cmd: "setConfig", provider: "zai" }, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("config_update_unavailable");
    }
  });
});

describe("control dispatcher — getLogs", () => {
  it("returns all lines when since=0", async () => {
    const logBuffer = new LogBuffer();
    logBuffer.push("[INFO] line one");
    logBuffer.push("[INFO] line two");
    const ctx: HandlerContext = { logBuffer };
    const result = await dispatch(
      { cmd: "getLogs" },
      { provider: "zai", plan: "coding-plan", proxyPort: 0 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok && "lines" in result) {
      expect(result.lines).toEqual(["[INFO] line one", "[INFO] line two"]);
      expect(result.nextSince).toBe(2);
    }
  });

  it("returns only lines after `since`", async () => {
    const logBuffer = new LogBuffer();
    logBuffer.push("a");
    logBuffer.push("b");
    logBuffer.push("c");
    const ctx: HandlerContext = { logBuffer };
    const result = await dispatch(
      { cmd: "getLogs", since: 1 },
      { provider: "zai", plan: "coding-plan", proxyPort: 0 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok && "lines" in result) {
      expect(result.lines).toEqual(["b", "c"]);
    }
  });

  it("returns empty when since is at cursor", async () => {
    const logBuffer = new LogBuffer();
    logBuffer.push("only");
    const ctx: HandlerContext = { logBuffer };
    const result = await dispatch(
      { cmd: "getLogs", since: 1 },
      { provider: "zai", plan: "coding-plan", proxyPort: 0 },
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok && "lines" in result) {
      expect(result.lines).toEqual([]);
    }
  });
});

describe("control dispatcher — quota", () => {
  const snapshot = {
    provider: "zai",
    serverTime: 1759195200,
    jwt: null,
    balances: [],
    claimablePlans: [],
    codingPlan: { level: "max", limits: [{ type: "TIME_LIMIT", remaining: 3894 }] },
    errors: [],
  };

  it("returns the snapshot from the onQuota hook", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onQuota: async () => snapshot,
    };
    const result = await dispatch({ cmd: "quota" }, state, ctx);
    expect(result.ok).toBe(true);
    if (result.ok && "quota" in result) {
      expect(result.quota).toEqual(snapshot);
      expect(result.quota.codingPlan?.level).toBe("max");
    }
  });

  it("returns quota_unavailable when the hook is missing", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const result = await dispatch({ cmd: "quota" }, state);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("quota_unavailable");
    }
  });

  it("surfaces hook failures verbatim (not-logged-in message)", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      onQuota: async () => {
        throw new Error("not logged in (run: zcode-proxy auth login)");
      },
    };
    const result = await dispatch({ cmd: "quota" }, state, ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not logged in");
    }
  });
});

describe("control dispatcher — startOAuth", () => {
  /** Offline login client: start succeeds, complete never settles (no network). */
  function stubClient(closed: { count: number }): OAuthFlowClient {
    return {
      provider: "zai",
      start: async (): Promise<OAuthFlowStart> => ({
        authorizeUrl: "https://login.example/authorize",
        callbackUrl: "",
        state: "flow-1",
      }),
      complete: (): Promise<OAuthFlowTokens> => new Promise(() => {}),
      close: async () => {
        closed.count++;
      },
    } as unknown as OAuthFlowClient;
  }

  it("returns the authorize URL and tracks the in-flight flow", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const closed = { count: 0 };
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      createLoginClient: () => stubClient(closed),
    };

    const started = await dispatch({ cmd: "startOAuth" }, state, ctx);
    expect(started.ok).toBe(true);
    if (started.ok && "authorizeUrl" in started) {
      expect(started.authorizeUrl).toBe("https://login.example/authorize");
    }
    expect(state.activeOauth).toBeDefined();

    state.activeOauth?.client.close().catch(() => {});
    state.activeOauth = undefined;
    expect(closed.count).toBe(1);
  });

  it("a second startOAuth tears down the previous flow", async () => {
    const state: ControlState = { provider: "zai", plan: "coding-plan", proxyPort: 0 };
    const firstClosed = { count: 0 };
    const secondClosed = { count: 0 };
    let n = 0;
    const ctx: HandlerContext = {
      logBuffer: new LogBuffer(),
      createLoginClient: () => stubClient(n++ === 0 ? firstClosed : secondClosed),
    };

    const first = await dispatch({ cmd: "startOAuth" }, state, ctx);
    expect(first.ok).toBe(true);
    const second = await dispatch({ cmd: "startOAuth" }, state, ctx);
    expect(second.ok).toBe(true);
    expect(firstClosed.count).toBe(1);
    expect(secondClosed.count).toBe(0);

    state.activeOauth?.client.close().catch(() => {});
    state.activeOauth = undefined;
    expect(secondClosed.count).toBe(1);
  });
});

describe("LogBuffer", () => {
  it("evicts oldest lines past capacity", () => {
    const buf = new LogBuffer(3);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    buf.push("d");
    expect([...buf.snapshot()]).toEqual(["b", "c", "d"]);
    expect(buf.cursor).toBe(4);
  });

  it("since() with stale cursor returns all surviving lines", () => {
    const buf = new LogBuffer(2);
    buf.push("a");
    buf.push("b");
    buf.push("c");
    // "a" was evicted; since=0 still returns only surviving lines.
    const result = buf.since(0);
    expect(result.lines).toEqual(["b", "c"]);
    expect(result.nextSince).toBe(3);
  });
});
