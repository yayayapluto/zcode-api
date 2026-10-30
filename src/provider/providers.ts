/**
 * Z.AI provider definition.
 * @see _reverse/NOTEPAD.md "Provider Endpoints"
 */
import type { ProviderDef, ProviderId } from "./types.js";

export const ZAI_PROVIDER: ProviderDef = {
  id: "zai",
  displayName: "Z.AI",
  anthropicBaseURL: "https://api.z.ai/api/anthropic",
  openaiBaseURL: "https://api.z.ai/api/coding/paas/v4",
  bizHost: "https://api.z.ai",
};

const PROVIDERS: Record<ProviderId, ProviderDef> = {
  zai: ZAI_PROVIDER,
};

/** Look up a provider definition by id. */
export function getProvider(id: ProviderId): ProviderDef {
  const def = PROVIDERS[id];
  if (!def) {
    throw new Error(`Unknown provider: "${id}"`);
  }
  return def;
}
