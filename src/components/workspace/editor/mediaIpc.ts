// M16 WP2 — the frontend half of the media transport: the `stat_media` and
// `open_in_default_app` wrappers, and the read-error classifier that routes a binary or
// oversized file to the media info card instead of the bare "Could not open".
//
// ⚠️ The asset URL is built ONLY from `MediaStat.path` (the backend's canonical, root-confined
// path), never from a path the frontend assembled. The `invoke` is injectable, as in
// finder/finderLaunch.ts, so the wrappers are unit-testable without mocking the module.

import { invoke } from "@tauri-apps/api/core";
import prefixes from "./readErrorPrefixes.json";

/** The subset of Tauri's `invoke` these helpers use; injectable for tests. */
export type Invoker = (
  cmd: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

/** Mirror of the Rust `editor_fs::MediaStat`. snake_case: Tauri does not camelCase returns. */
export interface MediaStat {
  path: string;
  size: number;
  mtime_ms: number;
  pdf_magic: boolean;
}

/** Stat a media file under `root` (and admit `root` to the asset scope). Rejects with the
 *  backend's error string: an escaping path, a missing file, a directory. */
export function statMedia(
  root: string,
  path: string,
  invoker: Invoker = invoke,
): Promise<MediaStat> {
  return invoker("stat_media", { root, path }) as Promise<MediaStat>;
}

/** Open a file inside `root` in its default macOS app. Surfaces a rejection (console.error)
 *  rather than dead-clicking, like the other launchers. */
export function openInDefaultApp(
  root: string,
  path: string,
  invoker: Invoker = invoke,
): Promise<void> {
  return invoker("open_in_default_app", { root, path })
    .then(() => undefined)
    .catch((err) => {
      console.error("[media] open in default app failed:", err);
    });
}

/** How a `read_file` failure is shown. `not-utf8` and `too-large` get the media info card;
 *  everything else (outside the root, missing, I/O) keeps the editor's error state. */
export type ReadErrorClass = "not-utf8" | "too-large" | "other";

/** Classify a `read_file` rejection by the message prefixes the Rust `EditorFsError` shares
 *  with this file through readErrorPrefixes.json (pinned on both sides). */
export function classifyReadError(err: unknown): ReadErrorClass {
  const message = String(err);
  if (message.startsWith(prefixes.notUtf8)) return "not-utf8";
  if (message.startsWith(prefixes.tooLarge)) return "too-large";
  return "other";
}
