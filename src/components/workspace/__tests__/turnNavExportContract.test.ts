import { describe, expect, it } from "vitest";
import * as turnMarkers from "../turnMarkers";
import workspaceSource from "../Workspace.tsx?raw";
import paneSource from "../XtermPane.tsx?raw";

// M13.5 WP3 Phase 3 — the EXPORT CONTRACT between turnMarkers and its consumers.
//
// ⚠️⚠️ THIS GUARD EXISTS BECAUSE ITS ABSENCE SHIPPED A BLANK APP (2026-08-25, found by the
// operator, not by any gate). Phase 1 deleted `inertAfter` while `Workspace.tsx` still imported
// it, and the plan called the resulting `tsc` error "the guard". **That framing was wrong in a
// load-bearing way: a missing ES-module export is a RUNTIME module-resolution failure, not merely
// a compile-time one.** The webview threw
//
//     SyntaxError: Importing binding name 'inertAfter' is not found
//
// which aborted `main.tsx` BEFORE React mounted — so the whole dev app was blank and unlaunchable
// for the entire duration of Phase 2. Worse, Phase 2's "live-pane" verification appeared to pass
// because the running webview still held a PRE-DELETION bundle, so a full verify-self →
// verify-human cycle banked stale-runtime evidence.
// Filed: SURFACE-2026-08-25-A-DELETED-EXPORT-BREAKS-THE-APP-AT-RUNTIME-NOT-JUST-TSC (high).
//
// ⚠️ WHY A TEST AND NOT JUST `tsc`. `tsc` does catch this — but the project's own history shows
// two ways that protection evaporates: (1) a phase plan can *deliberately* accept a red `tsc` and
// defer the fix, which is exactly what happened here; and (2) `pnpm exec tsc` exits 0 regardless
// of type errors in this repo ([[pnpm-exec-shadows-local-binaries]]), so a green-looking run
// proves nothing. A test in the suite cannot be deferred by a plan and cannot be faked by a
// shadowed binary. It fails the SAME gate everything else fails.
//
// ⚠️ This asserts the property `tsc` asserts, by a DIFFERENT mechanism — deliberate redundancy on
// a failure mode whose blast radius is "the app does not start".

/**
 * The **value** imports each consumer takes from `./turnMarkers` — the only ones that can fail at
 * runtime.
 *
 * ⚠️ `type`-only specifiers are EXCLUDED, and that exclusion is the whole correctness of this
 * guard. A first draft asserted every named import and immediately failed on `type StepDirection`
 * / `type TurnNavState`: those are erased by the compiler, never appear on the runtime module
 * object, and therefore **cannot** produce "Importing binding name … is not found". Asserting them
 * would have made this guard permanently red for correct code — and the tempting "fix" (loosening
 * the assertion) would have thrown away the real check with it.
 *
 * The distinction is exactly the one the shipped defect turned on: `inertAfter` was a **value**
 * import, so its deletion aborted module evaluation. A deleted *type* would have been a `tsc`
 * error only.
 */
/** Does the source still contain a parseable `from "./turnMarkers"` import at all? */
function matchesTurnMarkersImport(source: string): boolean {
  return /import\s*\{[^}]*\}\s*from\s*"\.\/turnMarkers"/.test(source);
}

function importedValueBindings(source: string): string[] {
  // Match `import { a, b, type C } from "./turnMarkers"` (multi-line tolerant).
  const re = /import\s*\{([^}]*)\}\s*from\s*"\.\/turnMarkers"/g;
  const names: string[] = [];
  for (const m of source.matchAll(re)) {
    for (const raw of m[1].split(",")) {
      const spec = raw.trim();
      if (!spec) continue;
      // `type X` / `type X as Y` — erased at compile time, cannot fail at runtime.
      if (/^type\s/.test(spec)) continue;
      const name = spec.split(/\s+as\s+/)[0].trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe("turnMarkers export contract — a deleted export breaks the app at RUNTIME", () => {
  it("is not vacuous — the PARSE still finds turnMarkers imports in both consumers", () => {
    // ⚠️ The emptiness meta-guard, and it asserts the PARSE rather than the value-import COUNT.
    // Every check below iterates a parsed list, so if the regex stopped matching (an import
    // reformatted, a path alias introduced, the file renamed) the lists would be empty and every
    // assertion would pass while verifying nothing — the "guard green while checking nothing"
    // class this repo keeps getting bitten by.
    //
    // ⚠️ It deliberately does NOT require a nonzero VALUE-import count. `Workspace.tsx` legitimately
    // takes only `type TurnNavState` today, so demanding a value import there would fail on
    // correct code and invite loosening the real check to make it pass. What must hold is that the
    // regex still SEES the import statement — that is the parse, and it is what can silently rot.
    expect(matchesTurnMarkersImport(paneSource)).toBe(true);
    expect(matchesTurnMarkersImport(workspaceSource)).toBe(true);
    // XtermPane is the one that genuinely holds value imports; if that reaches zero, its check
    // below has gone silent and someone should notice here.
    expect(importedValueBindings(paneSource).length).toBeGreaterThan(0);
  });

  it("⚠️ XtermPane imports nothing turnMarkers does not export", () => {
    for (const name of importedValueBindings(paneSource)) {
      expect(
        name in turnMarkers,
        `XtermPane.tsx imports \`${name}\` from ./turnMarkers, which does not export it. ` +
          `This is NOT just a type error — the webview throws "Importing binding name '${name}' ` +
          `is not found" and the app never mounts (blank window).`,
      ).toBe(true);
    }
  });

  it("⚠️ Workspace imports nothing turnMarkers does not export", () => {
    // This is the exact assertion whose absence shipped the blank app. It passes trivially while
    // `Workspace.tsx` holds only type imports — that is CORRECT (a type cannot fail at runtime),
    // and the moment it takes a value import again this check starts biting for real.
    for (const name of importedValueBindings(workspaceSource)) {
      expect(
        name in turnMarkers,
        `Workspace.tsx imports \`${name}\` from ./turnMarkers, which does not export it. ` +
          `This is NOT just a type error — the webview throws "Importing binding name '${name}' ` +
          `is not found" and the app never mounts (blank window).`,
      ).toBe(true);
    }
  });

  it("⚠️ the deleted backward-walk API is exported by NOBODY", () => {
    // Belt to the braces above: if one of these ever reappears as an export, the two
    // consumer checks would go quiet even though the old semantics were back.
    for (const gone of [
      "nextJump",
      "resetWalk",
      "initialWalkState",
      "inertAfter",
      "reachableTurnStarts",
    ]) {
      expect(
        gone in turnMarkers,
        `\`${gone}\` is part of the deleted backward-walk API and must not be re-exported`,
      ).toBe(false);
    }
  });
});
