// @ts-nocheck — the file-asset import below is a Bun extension with no type
// declaration.
/**
 * captcha-worker-asset.ts — sole carrier of Bun's `with { type: "file" }`
 * import: it is what embeds the pre-bundled worker into `bun build --compile`
 * binaries (`new Worker(new URL(...))` does not survive compilation).
 *
 * The file is a gitignored build input whose absence means "solve in-process"
 * (see captcha-worker-dispatch.ts). Importers must reach it via DYNAMIC
 * import only, so non-Bun bundlers never put it in their module graph.
 */
import entryPath from "./captcha-worker-entry.bundle.js" with { type: "file" };

export default entryPath;
