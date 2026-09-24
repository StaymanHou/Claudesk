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

/**
 * Consumers that span many rows, so they hold the raw gate under a named binding and must apply
 * the predicate at EVERY read: each use of the binding other than its declaration must be
 * `isWorkflowApplicable(<binding>, …)`.
 */
const ROW_SCOPED: Record<string, string> = {
  "components/picker/ProjectPicker.tsx": "gateOn",
};

/** Files known to route directly — asserted present so a regression that drops one is loud. */
const KNOWN_DIRECT = [
  "components/workspace/Workspace.tsx",
  "components/workspace/RightPanelHost.tsx",
  "components/picker/ProjectModelCell.tsx",
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

describe("workflow-applicability funnel — every caller routes (F-b ruling 4)", () => {
  it("every non-allowlisted call wraps the hook directly in isWorkflowApplicable(…)", () => {
    const violations: string[] = [];
    for (const f of callers) {
      if (f.rel in APP_WIDE || f.rel in ROW_SCOPED) continue;
      for (const i of callSites(f.flat)) {
        const before = f.flat.slice(0, i);
        if (!before.endsWith("isWorkflowApplicable(")) {
          violations.push(
            `${f.rel}: …${f.flat.slice(Math.max(0, i - 40), i + CALL.length)}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("a row-scoped caller applies the predicate at EVERY read of its raw binding", () => {
    for (const [rel, binding] of Object.entries(ROW_SCOPED)) {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} is gone — drop it from ROW_SCOPED`).toBeDefined();
      const decl = `const${binding}=${CALL}`;
      expect(f!.flat, `${rel} no longer declares ${decl}`).toContain(decl);
      const uses = [
        ...f!.flat.matchAll(new RegExp(`\\b${binding}\\b`, "g")),
      ].map((m) => m.index!);
      const bare = uses.filter(
        (i) =>
          !f!.flat.slice(0, i + binding.length).endsWith(`const${binding}`) &&
          !f!.flat.slice(0, i).endsWith("isWorkflowApplicable("),
      );
      expect(
        bare.map((i) => f!.flat.slice(Math.max(0, i - 40), i + 20)),
      ).toEqual([]);
      // At least one routed read, so the check cannot pass on a binding nothing uses.
      expect(uses.length).toBeGreaterThan(1);
    }
  });

  it("REVERSE: every allowlisted file still exists and still calls the hook", () => {
    for (const rel of [...Object.keys(APP_WIDE), ...Object.keys(ROW_SCOPED)]) {
      const f = files.find((x) => x.rel === rel);
      expect(f, `${rel} is gone — drop its allowlist entry`).toBeDefined();
      expect(
        callSites(f!.flat).length,
        `${rel} no longer calls the hook`,
      ).toBeGreaterThan(0);
    }
  });

  it("the known direct routers are still found as callers (identity, not a count)", () => {
    const found = new Set(callers.map((f) => f.rel));
    for (const rel of KNOWN_DIRECT) expect(found, rel).toContain(rel);
  });
});
