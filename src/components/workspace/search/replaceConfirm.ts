// WP7 Phase 3 — the pure spec for the "Replace All across project" confirm dialog.
//
// Project-wide replace is destructive (rewrites N files on disk), so it is gated behind
// an explicit confirm showing the match + file counts (the operator sees the blast
// radius before committing). This module is the React-free spec; it renders through the
// shared <ConfirmModal> (the same component the editor's close-guard / disk-conflict use).
// Pure → vitest (repo posture: pure logic → vitest, live DOM → Playwright).

import type { ConfirmSpec } from "../editor/confirmDialog";
import { pluralCount } from "./searchModel";

/** The two outcomes of the Replace-All confirm. */
export type ReplaceAllChoice = "replace" | "cancel";

/**
 * The Replace-All confirm dialog: Replace (danger — it rewrites files) / Cancel
 * (primary, the safe default). Esc → cancel. The message names the blast radius
 * (match + file counts from the last search) so the operator sees what will change.
 */
export function replaceAllSpec(
  matches: number,
  files: number,
  replacement: string,
): ConfirmSpec<ReplaceAllChoice> {
  // An empty replacement deletes the matched text — call that out so it isn't a surprise.
  const into =
    replacement === ""
      ? "with empty text (deletes the matches)"
      : `with "${replacement}"`;
  return {
    title: "Replace across project",
    message: `Replace ${pluralCount(matches, "match")} in ${pluralCount(files, "file")} ${into}? This rewrites files on disk and cannot be undone here.`,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel", variant: "primary" },
      {
        id: "replace",
        label: "Replace All",
        value: "replace",
        variant: "danger",
      },
    ],
    escValue: "cancel",
  };
}
