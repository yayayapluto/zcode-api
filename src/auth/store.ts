/**
 * Encrypted file-based credential store.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";
import type { Credential } from "./types.js";

const ENV_SECRET = "ZCODE_PROXY_CREDENTIAL_SECRET";
/**
 * Store directory override. Production always uses `~/.zcode-proxy`; this seam
 * exists so tests can point the store at an isolated temp dir — module-level
 * path constants forced store.test.ts onto the REAL user store, and running
 * the suite on a logged-in machine deleted the user's credentials
 * (`clearCredential` in test hooks, observed 2026-09-18). Evaluated per call
 * so the env var works even when set after module load.
 */
const ENV_STORE_DIR = "ZCODE_PROXY_STORE_DIR";

function storeDir(): string {
  return process.env[ENV_STORE_DIR]?.trim() || join(homedir(), ".zcode-proxy");
}

function storeFile(): string {
  return join(storeDir(), "credentials.json");
}

/**
 * Derive the AES-GCM key as SHA-256(seed) (audit R2-13). The previous XOR-fold
 * construction was a pseudo-KDF: a seed shorter than 32 bytes left zero blocks
 * in the key. Scope note: on default machine-derived seeds the security gain
 * is ~0 (any same-user process can re-derive the seed either way, 0o600 only
 * stops other users) — the motivation is structural: env-secret deployments
 * (`ZCODE_PROXY_CREDENTIAL_SECRET`) get real 32-byte diffusion, and the
 * misleading "KDF" is gone.
 */
function getEncryptionKey(): Uint8Array {
  const seed = process.env[ENV_SECRET] ?? `${homedir()}-${process.platform}-${process.arch}`;
  return new Uint8Array(createHash("sha256").update(seed, "utf-8").digest());
}

/**
 * Legacy XOR-fold key (pre-SHA-256 store format). Kept ONLY for the one-shot
 * migration decrypt in {@link loadCredential} — never used for new writes.
 */
function getLegacyEncryptionKey(): Uint8Array {
  const hash = new Uint8Array(new ArrayBuffer(32));
  const encoder = new TextEncoder();

  const seed = process.env[ENV_SECRET] ?? `${homedir()}-${process.platform}-${process.arch}`;
  const seedBytes = encoder.encode(seed);
  for (let i = 0; i < seedBytes.length; i++) {
    hash[i % 32] ^= seedBytes[i];
  }
  return hash;
}

/** Atomic store write: temp file (0o600) + rename over the target. */
function atomicWriteStore(contents: string): void {
  const target = storeFile();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, contents, { mode: 0o600 });
  renameSync(tmp, target);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  // Copy into a plain ArrayBuffer: bun-types types Uint8Array as
  // ArrayBufferLike, which is not assignable to BufferSource.
  const ab = new ArrayBuffer(raw.byteLength);
  new Uint8Array(ab).set(raw);
  return crypto.subtle.importKey(
    "raw",
    ab,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptWith(key: Uint8Array, plaintext: string): Promise<string> {
  const aesKey = await importAesKey(key);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(plaintext),
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return Buffer.from(combined).toString("base64");
}

async function decryptWith(key: Uint8Array, ciphertext: string): Promise<string> {
  const aesKey = await importAesKey(key);

  const combined = Buffer.from(ciphertext, "base64");
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    aesKey,
    data,
  );

  return new TextDecoder().decode(decrypted);
}

async function encrypt(plaintext: string): Promise<string> {
  return encryptWith(getEncryptionKey(), plaintext);
}

/** One login slot in the multi-account pool. */
export interface StoredAccount {
  /** Stable id: OAuth userId when known, else `key:<apiKey-prefix>`. */
  id: string;
  /** Epoch ms when the account was added. */
  addedAt: number;
  credential: Credential;
}

/** On-disk store shape (v2). v1 files hold a bare credential and migrate on load. */
interface CredentialStoreFile {
  version: 2;
  /** Account id serving traffic; null when the pool is empty. */
  activeId: string | null;
  accounts: StoredAccount[];
}

/** Derive a stable account id from a credential. */
export function accountIdFor(cred: Credential): string {
  if (cred.userId) return `user:${cred.userId}`;
  return `key:${cred.apiKey.slice(0, 12)}`;
}

function readStoreFile(): { encrypted?: string } | null {
  if (!existsSync(storeFile())) return null;
  try {
    return JSON.parse(readFileSync(storeFile(), "utf-8"));
  } catch {
    return null;
  }
}

async function decryptStore(parsed: { encrypted?: string }): Promise<string | null> {
  if (!parsed.encrypted) return null;
  try {
    return await decryptWith(getEncryptionKey(), parsed.encrypted);
  } catch {
    // Not decryptable under the new SHA-256 KDF — try the legacy XOR-fold key
    // (one-shot migration), then transparently re-store under the new format.
    try {
      return await decryptWith(getLegacyEncryptionKey(), parsed.encrypted);
    } catch (e) {
      // Stale/corrupt credential file — silently treat as "not logged in".
      console.warn(`Ignoring corrupted or stale credentials at ${storeFile()}: ${(e as Error).message}`);
      return null;
    }
  }
}

/** Parse the decrypted payload: v2 pool file, or a v1 bare credential (migrated). */
function parseAccounts(json: string): StoredAccount[] {
  const parsed = JSON.parse(json);
  if (Array.isArray(parsed.accounts)) {
    return parsed.accounts as StoredAccount[];
  }
  // v1 shape: the file holds a single credential object.
  if (parsed && typeof parsed.apiKey === "string") {
    const cred = parsed as Credential;
    return [{ id: accountIdFor(cred), addedAt: 0, credential: cred }];
  }
  return [];
}

async function loadStoreFile(): Promise<CredentialStoreFile | null> {
  const raw = readStoreFile();
  if (!raw) return null;
  const json = await decryptStore(raw);
  if (json === null) return null;
  let file: Partial<CredentialStoreFile>;
  try {
    file = JSON.parse(json);
  } catch (e) {
    console.warn(`Ignoring corrupted credentials at ${storeFile()}: ${(e as Error).message}`);
    return null;
  }
  const accounts = parseAccounts(json);
  if (accounts.length === 0) return null;
  const activeId = typeof file.activeId === "string" && accounts.some((a) => a.id === file.activeId)
    ? file.activeId
    : accounts[0]!.id;
  // Best-effort re-store in v2 format (migration + normalization).
  try {
    atomicWriteStore(JSON.stringify({ encrypted: await encrypt(JSON.stringify({ version: 2, activeId, accounts } satisfies CredentialStoreFile)) }));
  } catch (e) {
    console.warn(`Credential re-encryption under the new key derivation failed (will retry on next load): ${(e as Error).message}`);
  }
  return { version: 2, activeId, accounts };
}

async function writeStoreFile(file: CredentialStoreFile): Promise<void> {
  atomicWriteStore(JSON.stringify({ encrypted: await encrypt(JSON.stringify(file)) }));
}

export async function saveCredential(cred: Credential): Promise<void> {
  await saveAccount(cred);
}

/** Add (or refresh) an account; the new account becomes active. Returns its id. */
export async function saveAccount(cred: Credential): Promise<string> {
  mkdirSync(dirname(storeFile()), { recursive: true });
  const file = (await loadStoreFile()) ?? { version: 2 as const, activeId: null as string | null, accounts: [] as StoredAccount[] };
  const id = accountIdFor(cred);
  const existing = file.accounts.findIndex((a) => a.id === id);
  const entry: StoredAccount = { id, addedAt: existing >= 0 ? file.accounts[existing]!.addedAt : Date.now(), credential: cred };
  if (existing >= 0) file.accounts[existing] = entry;
  else file.accounts.push(entry);
  file.activeId = id;
  await writeStoreFile(file);
  return id;
}

/** Active account's credential, or null when logged out. Migrates v1 files. */
export async function loadCredential(): Promise<Credential | null> {
  const file = await loadStoreFile();
  if (!file) return null;
  return file.accounts.find((a) => a.id === file.activeId)?.credential ?? null;
}

/** All stored accounts (active first). */
export async function listAccounts(): Promise<StoredAccount[]> {
  const file = await loadStoreFile();
  if (!file) return [];
  const active = file.accounts.find((a) => a.id === file.activeId);
  const rest = file.accounts.filter((a) => a.id !== file.activeId);
  return active ? [active, ...rest] : rest;
}

/** Switch traffic to another stored account. */
export async function setActiveAccount(id: string): Promise<void> {
  const file = await loadStoreFile();
  if (!file || !file.accounts.some((a) => a.id === id)) {
    throw new Error(`unknown account "${id}" (run: zcode-proxy auth status)`);
  }
  file.activeId = id;
  await writeStoreFile(file);
}

/** Remove one account; clears the whole store when the pool becomes empty. */
export async function removeAccount(id: string): Promise<void> {
  const file = await loadStoreFile();
  if (!file) return;
  const accounts = file.accounts.filter((a) => a.id !== id);
  if (accounts.length === 0) {
    clearCredential();
    return;
  }
  await writeStoreFile({
    version: 2,
    activeId: file.activeId === id ? accounts[0]!.id : file.activeId,
    accounts,
  });
}

export function clearCredential(): void {
  if (existsSync(storeFile())) {
    unlinkSync(storeFile());
  }
}

export function getStorePath(): string {
  return storeFile();
}
