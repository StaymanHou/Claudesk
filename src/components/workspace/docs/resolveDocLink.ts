// M11 WP3 — resolve a cross-doc link to an entry in the discovered doc set.
//
// A markdown link is written relative to the doc containing it: `wbs.md` inside
// `workflow-system/product/vision.md` means `workflow-system/product/wbs.md`, not a file
// at the repo root. The panel's `rel_path`s are all root-relative, so a link has to be
// resolved against its source doc's directory before it can be matched.
//
// Pure string work — no filesystem, no `path` module (this runs in the webview). The doc
// set is the authority on what exists, so an unresolvable link is a *reportable outcome*
// rather than an error: the caller surfaces it instead of silently doing nothing.

import type { DocEntry } from "../docsOrder";

/** The outcome of resolving a cross-doc link. */
export type DocLinkResolution =
  /** Resolved to a doc in the set — `relPath` is the entry to select. */
  | { kind: "found"; relPath: string; fragment: string | null }
  /** A valid-looking path that is not in the discovered set (e.g. `CHANGELOG.md`). */
  | { kind: "not-in-set"; attempted: string };

/**
 * Normalize a POSIX-style path, collapsing `.` and `..` segments.
 *
 * ⚠️ A leading `..` that escapes the root is CLAMPED, not preserved: the doc set contains
 * only root-relative paths, so an escaped path could never match one anyway, and clamping
 * means the lookup fails closed (`not-in-set`) instead of producing a `../../etc/passwd`
 * string that gets handed onward. The backend re-validates every read against the project
 * root regardless (`editor_fs::read_file_core`) — this is defense in depth, not the only
 * guard.
 *
 * ⚠️ **Exported solely so the clamp can be TESTED.** It is not part of the module's
 * intended API. Measured at verify-self: the clamp is **unobservable through
 * `resolveDocLink`** — every candidate AND the reported `attempted` all pass through this
 * function, so no input distinguishes clamped from unclamped output. A test that drove the
 * outer function and asserted `attempted` had no `..` was therefore testing normalization,
 * not clamping, and **passed with the clamp deleted** (mutation verified landed). Testing
 * the clamp means calling this directly.
 */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      out.pop(); // popping an empty array is a no-op — this is the clamp.
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

/**
 * Resolve a cross-doc href against the doc it appears in.
 *
 * `href` is a relative link as written in the markdown (already classified `"cross-doc"`
 * by [`classifyHref`]). `fromRelPath` is the root-relative path of the doc being rendered.
 *
 * Any `#fragment` is split off and returned separately so the caller can scroll to it
 * after switching docs — `wbs.md#probe-outcomes` should land on the section, not just the
 * file. A fragment-only href never reaches here (that is `"anchor"`).
 *
 * Matching is exact against `rel_path`, with one deliberate fallback: a **root-relative**
 * interpretation is tried when the source-relative one misses. Docs in this corpus are
 * inconsistent about whether they write `wbs.md` or `workflow-system/product/wbs.md` from
 * a sibling file, and trying both is what makes real links work without teaching authors a
 * rule. The source-relative reading is tried FIRST, since that is what markdown means.
 */
export function resolveDocLink(
  href: string,
  fromRelPath: string,
  entries: readonly DocEntry[],
): DocLinkResolution {
  const hashAt = href.indexOf("#");
  const rawPath = hashAt === -1 ? href : href.slice(0, hashAt);
  const fragment = hashAt === -1 ? null : href.slice(hashAt + 1) || null;

  const fromDir = fromRelPath.includes("/")
    ? fromRelPath.slice(0, fromRelPath.lastIndexOf("/"))
    : "";

  const sourceRelative = normalizePath(
    rawPath.startsWith("/") ? rawPath : `${fromDir}/${rawPath}`,
  );
  const rootRelative = normalizePath(rawPath);

  for (const candidate of [sourceRelative, rootRelative]) {
    const hit = entries.find((e) => e.rel_path === candidate);
    if (hit !== undefined) {
      return { kind: "found", relPath: hit.rel_path, fragment };
    }
  }

  // Report the source-relative attempt: it is the markdown-correct reading, so it is the
  // more useful thing to show a user wondering why a link did nothing.
  return { kind: "not-in-set", attempted: sourceRelative };
}
