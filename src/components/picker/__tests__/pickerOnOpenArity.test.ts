import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// M12 WP3 Phase 3 — the `onOpen` arity guard.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS EXISTS: TYPESCRIPT CANNOT CATCH THE BUG
//
// The picker's prop is `onOpen: (projectPath: string, action: AutoResumeAction) => void`.
// A handler declared `(projectPath: string) => void` **satisfies that type** — function
// parameter counts are contravariant in TypeScript, so a handler taking FEWER parameters is
// assignable wherever more are supplied. It type-checks, it lints, and it **silently
// discards the action**.
//
// Measured, not assumed: after widening the prop, `tsc --noEmit` returned **zero errors**
// while `openFromOverlay` still took one parameter and would have dropped every auto-resume
// action from the overlay entry point. The fire door would have appeared to work (the
// workspace opens) and simply never fired — the same "silently does nothing" shape as the
// nesting trap and the Rust-side wire drift, and the third instance of it in this milestone.
//
// The two prior instances this repo paid for, both the same class:
//   • WP2's `CleanExitRoute::CcExitCommand` — declared in three vocabularies, called by
//     nothing, with a green exhaustiveness test reading as coverage.
//   • WP2's spawn-ordering term — a pure function added *beside* an unchanged `?`, so the
//     new term was never actually consumed.
//
// So the guard is structural: every handler wired to `onOpen` must declare BOTH parameters.
//
// This is a source-text guard and this repo has been bitten by those three times. Applied
// mitigations: comments are stripped before matching, the pattern targets a `const <name> =`
// declaration by regex (never positional slicing), each handler is looked up by name rather
// than by position, and a non-vacuity check runs first so an empty read fails loudly.

const APP = fileURLToPath(new URL("../../../App.tsx", import.meta.url));

/** App.tsx with comments removed — a comment mentioning a handler must not satisfy a match. */
function appCode(): string {
  return readFileSync(APP, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * Extract the parameter list of `const <name> = useCallback(( … ) => …` or
 * `const <name> = ( … ) =>`.
 */
function paramsOf(name: string, code: string): string {
  const re = new RegExp(
    `const ${name}\\s*=\\s*(?:useCallback\\s*\\(\\s*)?\\(([^)]*)\\)`,
  );
  const m = re.exec(code);
  if (m === null) {
    throw new Error(
      `could not find a 'const ${name} = (…)' declaration in App.tsx. If the handler was ` +
        `renamed or reshaped, update this guard deliberately — it is the only thing ` +
        `stopping a one-parameter handler from silently discarding the auto-resume action.`,
    );
  }
  return m[1];
}

describe("every onOpen handler declares BOTH parameters", () => {
  const code = appCode();

  it("App.tsx is readable (non-vacuity guard)", () => {
    // Without this, a failed read would make every assertion below trivially pass.
    expect(code.length).toBeGreaterThan(5000);
    expect(code).toContain("onOpen=");
  });

  it("openFromOverlay takes the pendingAction parameter", () => {
    // ⚠️ THE MUTATION TARGET. Dropping the second parameter here type-checks cleanly and
    // silently breaks auto-resume from the overlay picker.
    const params = paramsOf("openFromOverlay", code);
    expect(params).toContain("projectPath");
    expect(params).toContain("pendingAction");
  });

  it("both onOpen wirings point at handlers that accept an action", () => {
    // The picker is mounted twice (the launch scene and the overlay). Enumerate the actual
    // wirings from source rather than assuming there are two, so a third mount added later
    // is caught instead of silently unguarded.
    const wired = [...code.matchAll(/onOpen=\{(\w+)\}/g)].map((m) => m[1]);
    expect(wired.length).toBeGreaterThanOrEqual(2);

    for (const handler of wired) {
      if (handler === "openWorkspace") {
        // The hook's own `openWorkspace` declares `(projectPath, pendingAction = null)` —
        // verified in useWorkspaceList.ts by its own test; nothing to check here.
        continue;
      }
      const params = paramsOf(handler, code);
      expect(
        params,
        `${handler} is wired to onOpen but does not accept a second (action) parameter — ` +
          `TypeScript will NOT catch this; the action would be silently dropped`,
      ).toMatch(/pendingAction|action/);
    }
  });

  it("the extractor fails LOUDLY on a missing handler", () => {
    // Meta-test: proves the `throw` is reachable, so a renamed handler surfaces as an
    // explicit failure rather than as an assertion that quietly matched nothing.
    expect(() => paramsOf("noSuchHandler", code)).toThrow(/could not find/);
  });
});

describe("the workspace-list hook carries the action to the reducer", () => {
  const hook = readFileSync(
    fileURLToPath(
      new URL("../../../state/useWorkspaceList.ts", import.meta.url),
    ),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("openWorkspace accepts pendingAction and passes it to the reducer", () => {
    expect(hook).toContain("pendingAction");
    // The call shape, not a bare identifier: the parameter existing but not being forwarded
    // is exactly the "added beside an unchanged call" defect WP2 hit.
    expect(hook).toMatch(
      /openReducer\(\s*s,\s*projectPath,\s*pendingAction,\s*openIntent,?\s*\)/,
    );
  });

  it("openWorkspace accepts openIntent and forwards it too (P4.6)", () => {
    // ⚠️ A THIRD parameter now rides this path, exposed to the same contravariance trap: a
    // two-parameter `openWorkspace` still satisfies every caller and would silently drop the
    // intent — which is precisely how the `⏵` door came to resume anyway. The regex above
    // already pins the forwarding; this asserts the parameter is DECLARED, so the two halves
    // fail separately and name different causes.
    expect(hook).toContain("openIntent");
    expect(hook).toMatch(/openIntent:\s*OpenIntent/);
  });
});

describe("the open INTENT reaches cc_spawn (P4.6 — the boundary the defect crossed)", () => {
  // ⚠️ THE POINT OF THIS BLOCK. Every other assertion about the no-fire door was already green
  // when the door was broken: `actionForIntent(argv,"no-fire") === null` is mutation-proven, the
  // `⏵` hit-tests to itself, `pending_action` was correctly `null`. None of that mattered,
  // because the spawn call was `invoke(spawnCommand, { projectPath })` and the backend resolved
  // the argv arm from the unclean flag alone.
  //
  // So this guards the ONE line the intent has to survive. A source-text guard is the honest
  // instrument here: the alternative is rendering `XtermPane` (no component-render harness
  // exists — `SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS`) and spawning a real
  // `claude`. It verifies STRUCTURE, not runtime; the runtime proof is verify-self's live
  // `ps` check that the `⏵` door produces argv without `--continue`.
  //
  // ⚠️ Honest scoping of what `tsc` covers, measured rather than assumed. Deleting the prop from
  // the invoke entirely IS caught by `tsc` (TS6133 — the destructured prop becomes unused), so
  // this guard is not the only net for the crudest mutation. What `tsc` canNOT catch is the
  // shape that keeps the prop read but sends the wrong value (`intent: openIntent ? "fire" :
  // "fire"`), which passed `tsc` and 1886 tests until the pattern below was tightened. That
  // narrower case is this guard's real job.
  const pane = readFileSync(
    fileURLToPath(new URL("../../workspace/XtermPane.tsx", import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("XtermPane.tsx is readable (non-vacuity guard)", () => {
    expect(pane.length).toBeGreaterThan(5000);
    expect(pane).toContain("invoke");
  });

  it("the spawn invoke sends `intent` for cc_spawn", () => {
    // ⚠️ THE PATTERN IS ANCHORED AND TERMINATED, and that precision was earned by a mutation
    // that defeated the looser version. The first attempt was `/intent:\s*openIntent/`, which
    // MATCHED `intent: openIntent ? "fire" : "fire"` — a payload that always authorizes the argv
    // arm, i.e. the original defect restored. That mutant passed `tsc` (the prop is still read,
    // so no TS6133) AND all 1886 tests.
    //
    // So the assertion requires `openIntent` to be the WHOLE value: followed only by a comma,
    // brace, or whitespace-then-either. A ternary, a `||` fallback, or a literal now fails.
    // Same family as `[[raw-guard-identifier-satisfied-by-own-comments]]`: an identifier
    // *appearing* is not the identifier being *used as the value*.
    expect(pane).toMatch(/intent:\s*openIntent\s*[,}]/);
  });

  it("the intent payload is not a hardcoded literal or a ternary", () => {
    // The negative half, stated separately so a future loosening fails with a name that says
    // what went wrong. Mutation-derived: these are the exact shapes that slipped through.
    expect(pane).not.toMatch(/intent:\s*"(fire|no-fire)"/);
    expect(pane).not.toMatch(/intent:\s*openIntent\s*[?|]/);
  });

  it("the shell spawn does NOT send an intent", () => {
    // `term_spawn` is a login shell with no resume arm and its Rust command takes no such
    // parameter, so sending one would be a wire error. The conditional payload is what keeps
    // both spawn kinds correct from one call site.
    expect(pane).toMatch(/spawnCommand === "cc_spawn"/);
  });
});
