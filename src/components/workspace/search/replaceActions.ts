// M16.5 WP6 — the Find Results tab's hover Replace buttons, as pure data.
//
// `formatFindResults` says WHICH lines carry a replace target; this module turns those
// targets into the generic `SyntheticLineAction`s the read-only tab renders, and into the
// `scope` argument the backend `project_replace` takes. Pure (no React, no IPC), so the
// labels, the tooltips and the scope shape are vitest-testable.

import type { SyntheticLineAction } from "../editor/SyntheticView";
import type { ReplaceTarget } from "./findResultsBuffer";

/** The `scope` argument of `project_replace` (Rust `ReplaceScope`, `kind`-tagged). */
export type ReplaceScopeArg =
  | { kind: "file"; path: string }
  | {
      kind: "match";
      path: string;
      line: number;
      start: number;
      end: number;
      line_text: string;
    };

/** The IPC scope for a target — the search row carried back verbatim for the stale check. */
export function scopeFor(target: ReplaceTarget): ReplaceScopeArg {
  if (target.kind === "file") return { kind: "file", path: target.file };
  const m = target.match;
  return {
    kind: "match",
    path: target.file,
    line: m.line,
    start: m.start,
    end: m.end,
    line_text: m.line_text,
  };
}

/**
 * What the button will do, in words. An empty replacement deletes, so say that rather
 * than `Replace with ""`.
 */
export function replaceButtonTitle(
  target: ReplaceTarget,
  replacement: string,
): string {
  if (target.kind === "match") {
    return replacement === ""
      ? "Delete match"
      : `Replace with "${replacement}"`;
  }
  return replacement === ""
    ? `Delete every match in ${target.file}`
    : `Replace every match in ${target.file} with "${replacement}"`;
}

/**
 * One action per non-null target, on that target's 1-based buffer line. `run` receives
 * the target itself, so the caller never re-derives it from a line number.
 */
export function replaceLineActions(
  targets: (ReplaceTarget | null)[],
  replacement: string,
  run: (target: ReplaceTarget) => void,
): SyntheticLineAction[] {
  const actions: SyntheticLineAction[] = [];
  targets.forEach((target, i) => {
    if (target === null) return;
    actions.push({
      line: i + 1,
      label: target.kind === "file" ? "Replace in file" : "Replace",
      title: replaceButtonTitle(target, replacement),
      testid:
        target.kind === "file" ? "find-replace-file" : "find-replace-match",
      onClick: () => run(target),
    });
  });
  return actions;
}
