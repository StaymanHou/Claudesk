// M11 WP2 — pure ordering + labelling for the Docs panel's file list.
//
// The backend (`docs_list`, src-tauri/src/docs/) reports WHICH conventional workflow docs
// exist under a project root, in discovery order. This module decides the order they are
// PRESENTED in, and what each row is called. Kept pure (no React/DOM) so it is
// vitest-testable — the same split as panelHost.ts / docsOrder's sibling chord modules
// (repo posture: pure logic → vitest, live DOM → Playwright).
//
// ── Why this order, and why it is not alphabetical ──────────────────────────────
// The panel is a RE-ORIENTATION surface, not a file browser. Its job is to answer "where
// is this project?" in the order a person actually reconstructs that: what are we building
// (vision) → what is the plan (roadmap) → what is the current cycle (wbs) → what is in
// flight right now (wip) → what is outstanding (backlog) → where did the last session stop
// (.session.md). Those six are the narrative spine, ordered by how often they answer the
// question. The reference docs (arch, research, context, design-priors, transitions) follow
// as a tail: consulted deliberately when you need them, not scanned to re-orient.
//
// Alphabetical would interleave the spine with the tail (`arch.md` first, `wip` near the
// end) and destroy exactly the property that makes the panel worth opening.

/** One discovered doc, mirroring the backend `DocEntry` DTO.
 *
 * snake_case field names are deliberate and load-bearing: Tauri does NOT camelCase command
 * return values, so this type must mirror the Rust struct verbatim. Pinned on the backend
 * side by `doc_entry_serde_shape_is_snake_case` (src-tauri/src/docs/mod.rs) — a rename
 * there breaks that test rather than silently breaking this mirror.
 */
export interface DocEntry {
  /** Path relative to the project root, forward-slashed. Passed back to `docs_read`. */
  rel_path: string;
  /** Stable identity for ordering + labelling (e.g. `vision`, `wbs`, `wip`). */
  kind: string;
  /** The file's own basename — distinguishes `wbs.md` from `m11-wbs-parked.md`. */
  file_name: string;
}

/** The presentation order, by `kind`. Index = rank; anything unlisted sorts last.
 *
 * Order is the narrative spine first (vision → … → session), then the reference tail. See
 * the module header for why. Changing this changes what the panel is FOR, so it is a
 * product decision — not a detail to tidy alphabetically.
 */
const KIND_ORDER: readonly string[] = [
  // ── The spine: how a person reconstructs "where is this project?" ──
  "vision",
  "roadmap",
  "wbs",
  "wip",
  "backlog",
  "backlog-quality-findings",
  "session",
  // ── The reference tail: consulted deliberately, not scanned ──
  "arch",
  "research",
  "context",
  "design-priors",
  "transitions",
];

/** Human-readable labels for the single-file kinds.
 *
 * Multi-file kinds (`wbs`, `wip`) are deliberately absent — they are labelled from their
 * `file_name` instead, since one project can hold several and "WBS" three times over would
 * be useless. See `labelFor`.
 */
const KIND_LABELS: Readonly<Record<string, string>> = {
  vision: "Vision",
  roadmap: "Roadmap",
  backlog: "Backlog",
  "backlog-quality-findings": "Backlog — quality findings",
  session: "Session pointer",
  arch: "Architecture",
  research: "Research",
  context: "Context",
  "design-priors": "Design priors",
  transitions: "Transitions",
};

/** Kinds that can legitimately appear more than once in one project. */
const MULTI_FILE_KINDS: ReadonlySet<string> = new Set(["wbs", "wip"]);

/** Rank for a `kind`; unknown kinds sort after every known one (stable, never dropped).
 *
 * An unknown kind is NOT an error and is NOT filtered out: the backend owns the curated
 * set, and if it grows a kind this list hasn't learned yet, showing it last beats hiding
 * a doc the user can see on disk.
 */
function rankOf(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i === -1 ? KIND_ORDER.length : i;
}

/**
 * Order discovered docs for display: by `KIND_ORDER`, then by `file_name` within a kind.
 *
 * Pure and non-mutating — returns a new array; the input is left untouched (the caller
 * holds it in React state). Absent docs simply aren't in the input, so no placeholder
 * rows are produced.
 *
 * The within-kind tiebreak is `file_name`, which matters for the multi-file kinds: several
 * `*wbs*.md` or several `wip/*.md` sort deterministically rather than in filesystem order.
 */
export function orderDocs(entries: readonly DocEntry[]): DocEntry[] {
  return [...entries].sort((a, b) => {
    const byKind = rankOf(a.kind) - rankOf(b.kind);
    if (byKind !== 0) return byKind;
    return a.file_name.localeCompare(b.file_name);
  });
}

/**
 * The display label for one row.
 *
 * Single-file kinds get a curated human label ("Vision", "Architecture"). Multi-file kinds
 * (`wbs`, `wip`) get their `file_name`, because a project can hold several and the filename
 * is the only thing that tells them apart. An unknown kind also falls back to `file_name` —
 * a real name beats a fabricated one.
 */
export function labelFor(entry: DocEntry): string {
  if (MULTI_FILE_KINDS.has(entry.kind)) return entry.file_name;
  return KIND_LABELS[entry.kind] ?? entry.file_name;
}

/** What the Docs panel should show, given its two pieces of fetch state. */
export type DocsView = "loading" | "error" | "empty" | "list";

/**
 * Which single view the Docs panel renders — extracted from JSX so it is assertable as a
 * VALUE rather than by reading source text (the repo rule: anything involving async or
 * ordering must be a pure function, never a `?raw` guard).
 *
 * The states are MUTUALLY EXCLUSIVE and exhaustive, which is the property worth pinning:
 * the JSX renders three independent conditionals, so a sloppy edit could show two at once
 * (an error banner above an "empty" message) or none at all.
 *
 * ⚠️ The load-bearing case is `error` BEFORE `empty`. A failed `docs_list` sets both
 * `error` and `docs = []`; if emptiness won, a permission failure or a backend bug would
 * read to the user as "this project has no docs" — a wrong answer presented confidently,
 * which is worse than an error. Error always wins.
 */
export function docsView(
  docs: readonly DocEntry[] | null,
  error: string | null,
): DocsView {
  if (error !== null) return "error";
  if (docs === null) return "loading";
  return docs.length === 0 ? "empty" : "list";
}
