import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// F-b ruling 4 — the CALLER-side guard for the workflow-applicability funnel.
//
// `isWorkflowApplicable` (../workflowApplicable.ts) is correct in itself; the recurring defect
// in this repo is a correct mechanism behind a CALLER that does not use it. So this pins every
// call site of `useWorkflowFeaturesEnabled()` in production source, in BOTH directions:
//   forward — every call is either wrapped directly as
//             `isWorkflowApplicable(useWorkflowFeaturesEnabled(), …)`, or named below;
//   reverse — every name below still exists and still calls the hook (a stale entry would
//             otherwise exempt a file forever — lesson entry 13, the omission a one-way guard
//             cannot see).

const SRC = join(__dirname, "..", "..");

/** App-wide consumers: not scoped to one workspace or row, so the raw gate is right. */
const APP_WIDE: Record<string, string> = {
  "App.tsx": "the workflow invite — app-wide, not per workspace",
};

/** Files known to route — asserted present so a regression that drops one is loud. */
const KNOWN_ROUTED = [
  "components/workspace/Workspace.tsx",
  "components/workspace/RightPanelHost.tsx",
  "components/picker/ProjectModelCell.tsx",
  "components/picker/ProjectPicker.tsx",
];

function productionFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      productionFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Block comments and `//` line comments out, then ALL whitespace out (reflow-proof). */
function flatten(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\s+/g, "");
}

const CALL = "useWorkflowFeaturesEnabled()";

function callSites(flat: string): number[] {
  const at: number[] = [];
  for (let i = flat.indexOf(CALL); i !== -1; i = flat.indexOf(CALL, i + 1)) {
    // The declaration `function useWorkflowFeaturesEnabled():` is not a call.
    if (flat.slice(Math.max(0, i - 8), i) === "function") continue;
    at.push(i);
  }
  return at;
}

const files = productionFiles(SRC).map((f) => ({
  rel: relative(SRC, f),
  flat: flatten(readFileSync(f, "utf8")),
}));
const callers = files.filter((f) => callSites(f.flat).length > 0);

/**
 * The two accepted shapes for a non-allowlisted call:
 *   direct  — `isWorkflowApplicable(useWorkflowFeaturesEnabled(), …)`;
 *   binding — `const <x>[: T] = useWorkflowFeaturesEnabled()`, where EVERY other read of `<x>` is
 *             `isWorkflowApplicable(<x>, …)`. Needed where the hook result spans many rows (the
 *             picker), and where an inline call trips the React Compiler (`ProjectModelCell`:
 *             passing a prop into an opaque call widened its hand-memoized callbacks' deps).
 * Returns a violation string, or null.
 */
function checkCall(flat: string, i: number): string | null {
  const before = flat.slice(0, i);
  if (before.endsWith("isWorkflowApplicable(")) return null;
  const m = /const([A-Za-z_$][\w$]*)(?::[A-Za-z_$][\w$<>.]*)?=$/.exec(before);
  if (!m)
    return `…${flat.slice(Math.max(0, i - 40), i + CALL.length)} (not wrapped, not bound)`;
  const x = m[1];
  const declEnd = i + CALL.length;
  const reads = [
    ...flat.matchAll(
      new RegExp(`(?<![\\w$])${x.replace(/\$/g, "\\$")}(?![\\w$])`, "g"),
    ),
  ]
    .map((r) => r.index!)
    .filter((j) => j > declEnd);
  if (reads.length === 0) return `binding \`${x}\` is never read`;
  // The one other accepted read: the deps array of `useMemo(() => isWorkflowApplicable(x, …),
  // [ …x… ])` — exhaustive-deps bookkeeping for a memoized predicate, not a use of the raw gate.
  const memoDeps: [number, number][] = [];
  const memo = new RegExp(
    `useMemo\\(\\(\\)=>isWorkflowApplicable\\(${x},[^)]*\\),\\[([^\\]]*)\\],?\\)`,
    "g",
  );
  for (const mm of flat.matchAll(memo)) {
    const start = mm.index! + mm[0].lastIndexOf("[");
    memoDeps.push([start, start + mm[1].length + 1]);
  }
  const bare = reads.filter(
    (j) =>
      !flat.slice(0, j).endsWith("isWorkflowApplicable(") &&
      !memoDeps.some(([a, b]) => j > a && j < b),
  );
  return bare.length === 0
    ? null
    : `binding \`${x}\` read bare: ${bare.map((j) => flat.slice(Math.max(0, j - 30), j + x.length + 10)).join(" | ")}`;
}

describe("workflow-applicability funnel — every caller routes (F-b ruling 4)", () => {
  it("every non-allowlisted call is wrapped, or bound and routed at every read", () => {
    const violations: string[] = [];
    for (const f of callers) {
      if (f.rel in APP_WIDE) continue;
      for (const i of callSites(f.flat)) {
        const v = checkCall(f.flat, i);
        if (v) violations.push(`${f.rel}: ${v}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("REVERSE: every allowlisted file still exists and still calls the hook", () => {
    for (const rel of Object.keys(APP_WIDE)) {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} is gone — drop its allowlist entry`).toBeDefined();
      expect(
        callSites(f!.flat).length,
        `${rel} no longer calls the hook`,
      ).toBeGreaterThan(0);
    }
  });

  it("the known routers are still found as callers (identity, not a count)", () => {
    const found = new Set(callers.map((f) => f.rel));
    for (const rel of KNOWN_ROUTED) expect(found, rel).toContain(rel);
  });
});
