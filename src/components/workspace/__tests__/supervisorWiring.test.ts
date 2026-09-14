// M15 WP4 Phase 4 verify-codify — THE CONSUMING SURFACE'S WIRING.
//
// ⚠️ **WHY THIS FILE EXISTS SEPARATELY FROM `useSupervisor.test.ts`.** That file guards the HOOK;
// this one guards the **consuming surface** — `Workspace.tsx` — which is what the phase's
// integration boundary is actually about. A perfect hook that no component mounts is the standing
// local defect shape exactly: *a mechanism correct in itself behind a caller that does not honor
// it* (four occurrences in this repo, one shipped CRITICAL). Nothing pinned that wiring before
// this file.
//
// ⚠️ **THE STAKES ARE HIGHER HERE THAN USUAL, BECAUSE THE LIVE BEHAVIOR IS UNOBSERVED.** Five
// behavioral checks were deferred to dogfooding at verify-human (see
// `SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-SESSION`), so these structural
// guards are currently the ONLY thing standing between a wiring regression and a silent
// never-fires. They are not a substitute for the live checks and must not be read as one.
//
// ── Why `?raw`, under this repo's hard-won rules ────────────────────────────────
// The properties below are STRUCTURAL (which hook is mounted, which value is passed as the gate,
// which callback routes the recycle). There is no React component-render harness in this repo
// (SURFACE-2026-07-31-NO-REACT-COMPONENT-RENDER-HARNESS), so `?raw` is the right tier — used
// exactly as `docsPanelWiring.test.ts` established:
//
//   1. COMMENTS ARE STRIPPED before matching. A guard asserting a bare identifier is otherwise
//      satisfied by the module's OWN PROSE, so it would pass precisely when the code it names had
//      been deleted (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
//   2. Assert a CALL or ARGUMENT SHAPE, never a bare identifier.
//   3. An emptiness meta-guard, so a broken read cannot make every `not.toMatch` pass vacuously.

import { describe, expect, it } from "vitest";
import workspaceSource from "../Workspace.tsx?raw";

/** `Workspace.tsx` with comments stripped — see rule 1 above. */
const code = workspaceSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("⚠️ Workspace.tsx mounts the supervisor (the consuming surface)", () => {
  it("meta: the raw import is reading real source, not an empty string", () => {
    // ⚠️ Rule 3. Without this, every assertion below could pass vacuously on a broken import —
    // and a `?raw` import of a non-`.ts` file has silently returned processed output in this
    // repo before (`[[vitest-raw-import-css-returns-processed-not-text]]`).
    expect(code.length).toBeGreaterThan(5000);
    expect(code).toContain("export function Workspace");
  });

  it("⚠️ CALLS useSupervisor — without this the whole feature is dead code", () => {
    // ⚠️ THE LOAD-BEARING ASSERTION. `useSupervisor` could be imported and never called, and
    // `tsc` would say nothing (an unused import is a lint warning at most). The supervisor would
    // then never fire, silently, with every other test still green.
    expect(code).toMatch(/useSupervisor\(\{/);
  });

  it("⚠️ passes the M10.9 workflow gate as `enabled`", () => {
    // ⚠️ The OFF-invariant's first half: with the gate OFF the app must be byte-identical to one
    // that never had the workflow features. Hardcoding `enabled: true` here would supervise every
    // project on the machine regardless of the operator's setting.
    expect(code).toMatch(/enabled:\s*workflowFeaturesEnabled/);
    expect(code).not.toMatch(/enabled:\s*true/);
  });

  it("⚠️ passes the STORED drive mode ref, not a literal", () => {
    // R-1: the stored mode is the authority, and a project with none is not supervised. Passing a
    // default here would enforce a policy the operator never selected.
    expect(code).toMatch(/storedModeRef:\s*storedDriveModeRef/);
  });

  it("⚠️ routes the recycle to the EXISTING fireRecycle — no second call site", () => {
    // ⚠️ `recycleSession`'s own header rule is "every caller enters here". A second recycle path
    // would duplicate the `recycling` re-entrancy guard, the AbortController wiring, and the
    // failure-arm surfacing — three chances to diverge.
    expect(code).toMatch(/onRecycle:\s*\(info\)\s*=>/);
    expect(code).toMatch(/fireRecycle\(\)/);
    // ⚠️ And the component must NOT reach past the funnel into `recycleSession` for this path.
    // (`fireRecycle` itself calls it once — asserting "at most one call site" catches a second.)
    expect(code.match(/recycleSession\(\{/g) ?? []).toHaveLength(1);
  });

  it("⚠️ announces the recycle ONLY WHEN IT ACTUALLY STARTS", () => {
    // The operation is unattended and runs up to 3 minutes. Without the announcement an operator
    // returning to the pane sees a session that restarted for no visible reason. `console.warn`
    // matches the row's established failure channel (M13's decision — an error overlay over a
    // working terminal would be worse).
    //
    // ⚠️ **THIS GUARD USED TO PIN THE DEFECT.** It asserted the announcement came BEFORE the
    // call, which is precisely the bug: `fireRecycle` declines when the session id is null or a
    // recycle is already running, and the `FireLedger` has ALREADY claimed the turn — so an
    // announced-but-declined recycle is neither fired nor recycled, never reconsidered, and its
    // only diagnostic asserts the opposite of what happened. The announcement must be GATED on
    // the return value.
    expect(code).toMatch(/if\s*\(fireRecycle\(\)\)/);
    expect(code).toMatch(/supervisor: recycling/);
  });

  it("⚠️ logs the DECLINED recycle distinctly", () => {
    // ⚠️ The declined arm is the turn the ledger consumed for nothing. Naming it is the only way
    // the stall is diagnosable — and it is exactly the case M15's deferred behavioral checks
    // would otherwise hit blind.
    expect(code).toMatch(/supervisor: recycle DECLINED/);
  });

  it("⚠️ does NOT wire fanOut — the host is per-workspace", () => {
    // ⚠️ `fanOut` sweeps N workspaces and reads like the natural choice at a component that owns
    // one. Wiring it here WOULD COMPILE and leave the recycle branch unable to act, because
    // `recycleSession` needs this component's own refs.
    expect(code).not.toMatch(/\bfanOut\b/);
  });
});
