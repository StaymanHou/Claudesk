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
  // M18 WP4 (D8): the funnel module's second wrapper, for the absent-host note (it reads the gate
  // through the same profile + host inputs; it is never a workflow surface itself).
  if (before.endsWith("isWorkflowApplicable(")) return null;
  if (before.endsWith("isWorkflowHostBlocked(")) return null;
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

// ── M18 WP4 (D7) — the funnel's THIRD input, at every call site ────────────────────────────────
//
// A consumer that drops the host, or passes a literal `"local"`, would make a REMOTE workspace on a
// skill-less host read as applicable. `tsc` catches a dropped argument; it cannot catch a literal
// (a widened argument breaks no type). So every production `isWorkflowApplicable(` call must pass
// a host that comes from the seam: a hook-bound identifier (`const x = useHostSubstrate(…)`), or
// an inline `hostSubstrateFor(` / `hostFromOpenCheck(` / `useHostSubstrate(` call — and never
// the string `"local"` anywhere in that argument.

const FUNNEL = "isWorkflowApplicable(";
/** The funnel module's two wrappers of the raw gate; both take the host as their third input. */
const FUNNELS = [FUNNEL, "isWorkflowHostBlocked("];
const HOST_SOURCES = [
  "useHostSubstrate(",
  "hostSubstrateFor(",
  "hostFromOpenCheck(",
];

/** The top-level arguments of the call whose `(` is at `open` (flattened text). */
export function topLevelArgs(flat: string, open: number): string[] | null {
  const args: string[] = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < flat.length; i++) {
    const c = flat[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        const last = flat.slice(start, i);
        // A trailing comma (Prettier's) is not an argument.
        if (last !== "" || args.length === 0) args.push(last);
        return args;
      }
    } else if (c === "," && depth === 1) {
      args.push(flat.slice(start, i));
      start = i + 1;
    }
  }
  return null;
}

/** A violation for one funnel call's host argument, or null. */
export function checkHostArg(
  flat: string,
  host: string | undefined,
): string | null {
  if (host === undefined || host === "") return "no host argument";
  if (host.includes('"local"') || host.includes("'local'"))
    return `a literal "local" host: ${host}`;
  if (HOST_SOURCES.some((src) => host.includes(src))) return null;
  if (/^[A-Za-z_$][\w$]*$/.test(host)) {
    const bound = new RegExp(
      `const${host.replace(/\$/g, "\\$")}(?::[A-Za-z_$][\\w$<>.|]*)?=(${HOST_SOURCES.map(
        (x) => x.replace("(", "\\("),
      ).join("|")})`,
    );
    return bound.test(flat)
      ? null
      : `host \`${host}\` is not bound from the seam`;
  }
  return `host argument not from the seam: ${host}`;
}

/** Every production funnel call in `flat` with its host-argument violation (or null). */
export function funnelCalls(
  flat: string,
): { host: string; violation: string | null }[] {
  const out: { host: string; violation: string | null }[] = [];
  for (const name of FUNNELS) {
    for (let i = flat.indexOf(name); i !== -1; i = flat.indexOf(name, i + 1)) {
      if (flat.slice(Math.max(0, i - 8), i) === "function") continue;
      if (flat.slice(Math.max(0, i - 6), i) === "export") continue;
      // `isWorkflowApplicable(` is not a substring of `isWorkflowHostBlocked(`, nor the
      // reverse, so each call is counted under exactly one name.
      const args = topLevelArgs(flat, i + name.length - 1);
      const host = args?.[2];
      out.push({
        host: host ?? "",
        violation:
          args === null || args.length !== 3
            ? `${args?.length ?? "?"} arguments, not 3`
            : checkHostArg(flat, host),
      });
    }
  }
  return out;
}

describe("workflow-applicability funnel — every call passes a seam host (M18 WP4)", () => {
  const funnelFiles = files.filter(
    (f) =>
      f.rel !== "state/workflowApplicable.ts" &&
      FUNNELS.some((n) => f.flat.includes(n)),
  );

  it("every production funnel call passes three arguments, the third from the seam", () => {
    const violations = funnelFiles.flatMap((f) =>
      funnelCalls(f.flat)
        .filter((c) => c.violation !== null)
        .map((c) => `${f.rel}: ${c.violation}`),
    );
    expect(violations).toEqual([]);
  });

  it("REVERSE: every known router makes at least one seam-host funnel call (not vacuous)", () => {
    for (const rel of KNOWN_ROUTED) {
      const f = funnelFiles.find((x) => x.rel === rel);
      expect(f, `${rel} no longer calls the funnel`).toBeDefined();
      const calls = funnelCalls(f!.flat);
      expect(calls.length, rel).toBeGreaterThan(0);
      expect(
        calls.every((c) => c.violation === null),
        rel,
      ).toBe(true);
    }
  });

  it("the host check itself bites (each form, on its own)", () => {
    const hook = "constwsHost=useHostSubstrate(p);";
    const call = (host: string) =>
      funnelCalls(`${hook}isWorkflowApplicable(g,profile${host})`)[0].violation;
    expect(call(",wsHost")).toBeNull();
    expect(call(",hostSubstrateFor(p,map)")).toBeNull();
    expect(call(",x?hostFromOpenCheck(x):hostSubstrateFor(p,map)")).toBeNull();
    // A dropped host, a literal, a literal hidden in a ternary arm, an unbound identifier.
    expect(call("")).toMatch(/2 arguments/);
    expect(call(",wsHost,")).toBeNull(); // a trailing comma is not a fourth argument
    expect(call(',"local"')).toMatch(/literal/);
    expect(call(',x?"local":hostSubstrateFor(p,map)')).toMatch(/literal/);
    expect(call(",someHost")).toMatch(/not bound/);
    // The note's wrapper is held to the same host rule.
    expect(
      funnelCalls(`${hook}isWorkflowHostBlocked(g,profile,"local")`)[0]
        .violation,
    ).toMatch(/literal/);
    expect(call(',{state:"developer"}')).toMatch(/not from the seam/);
  });
});

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
