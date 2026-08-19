import { describe, expect, it } from "vitest";
import workspaceSource from "../Workspace.tsx?raw";

// Paydown WP7 — Recycle must abort when its caller unmounts.
//
// ⚠️ WHY THIS GUARD IS CALLER-SIDE, AND WHY IT IS A SEPARATE FILE.
//
// `recycleSession.test.ts` proves the OPERATION is abortable: every abort site, the D1 ruling, the
// subscription teardown. All of that can be perfectly correct behind a caller that never passes a
// signal — and then the defect WP7 exists to close is still shipped. This repo has done exactly
// that twice in M11 WP4, once as a shipped CRITICAL, and the standing lesson is blunt about it:
// **extracting a pure state machine proves the MACHINE, not its CALLER**
// (`docs/lessons/verify-self-tiers.md`). `recycleMachine.ts` already existed and was already
// proven when this defect shipped.
//
// So the obligation pinned here is the half a well-tested operation cannot enforce on itself:
// that `<Workspace>` creates a controller, hands its signal to `recycleSession`, and aborts it on
// unmount. A source guard is the instrument because `Workspace.tsx` renders the whole xterm +
// Tauri surface — there is no cheap render harness — and this is the same shape
// `injectOnceOnRelaunch.test.ts` uses for M12's caller-side obligation.
//
// ⚠️ Comments are stripped FIRST. This file's own prose names every identifier asserted below, and
// so does `Workspace.tsx`'s — a `?raw` guard satisfied by the module's own comments passes exactly
// when the named code is deleted (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
const code = workspaceSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("Workspace aborts an in-flight Recycle on unmount (caller-side wiring)", () => {
  it("is not vacuous — the stripped source still contains the recycle call site", () => {
    // ⚠️ The emptiness meta-guard. Every assertion below is a `toMatch` against `code`; if the
    // strip ever over-matched (a regex change, a `?raw` import that stopped resolving) `code`
    // could go empty or lose the region and every other test here would fail LOUDLY — but a
    // subtler over-strip could remove just the comments' neighbours. Pin the haystack first.
    expect(code).toMatch(/recycleSession\(\{/);
    expect(code.length).toBeGreaterThan(2000);
  });

  it("holds the abort controller in a ref, not in state", () => {
    // A ref because the controller must survive re-renders unchanged and aborting is a cleanup
    // concern. `useState` here would re-render the workspace on every Recycle click for a value
    // nothing renders.
    expect(code).toMatch(
      /recycleAbortRef\s*=\s*useRef<AbortController \| null>\(null\)/,
    );
  });

  it("⚠️ aborts the controller from an unmount cleanup with an EMPTY dep array", () => {
    // The dep array is the load-bearing detail. A non-empty one (`[recycling]`, say) would run
    // the cleanup on every change of that value and abort a live Recycle mid-flight — turning a
    // fix into a worse defect than the one it replaces. Anchored as one expression so a mutant
    // that keeps the abort but re-runs it on every render cannot pass.
    expect(code).toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\(\)\s*=>\s*\{\s*recycleAbortRef\.current\?\.abort\(\);\s*\},\s*\[\],?\s*\)/,
    );
  });

  it("⚠️ passes the controller's SIGNAL into recycleSession", () => {
    // THE obligation. Anchored to `signal:` immediately inside the `recycleSession({` literal so
    // a mutant that constructs a controller, aborts it correctly, and never hands it over — the
    // exact silent shape of the class this guard exists for — fails.
    expect(code).toMatch(/recycleSession\(\{\s*signal:\s*ac\.signal,/);
    // And the controller handed over is the same one the ref holds.
    expect(code).toMatch(/const ac = new AbortController\(\);/);
    expect(code).toMatch(/recycleAbortRef\.current = ac;/);
  });

  it("clears the ref when the run finishes, identity-checked", () => {
    // Without the `=== ac` check, a completed run would null out a LATER run's controller, and
    // the unmount abort would then silently do nothing — the original defect, restored through
    // the back door.
    expect(code).toMatch(
      /if \(recycleAbortRef\.current === ac\) recycleAbortRef\.current = null;/,
    );
  });

  it("does NOT warn on the aborted reason", () => {
    // `aborted` means the operator closed the workspace: nothing happened to them and there is no
    // surface left to say it on. Warning would make an ordinary close read as a defect in the log.
    expect(code).toMatch(/!outcome\.ok && outcome\.reason !== "aborted"/);
  });
});
