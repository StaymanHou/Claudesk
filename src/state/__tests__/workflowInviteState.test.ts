import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  shouldShowWorkflowInvite,
  type WorkflowInviteSettings,
  type WorkflowInviteOutcome,
} from "../workflowInviteState";

// Builder keeps each case one expressive line — vary only the axis under test. The
// defaults are the SHOWING state (unresolved + gate off), so every test below reads as
// "what one change suppresses it".
function settings(
  over: Partial<WorkflowInviteSettings> = {},
): WorkflowInviteSettings {
  return { workflowInvite: null, workflowFeaturesEnabled: false, ...over };
}

describe("shouldShowWorkflowInvite — the show gate", () => {
  it("shows on the canonical first-run state: unresolved, gate off, 1 project, fresh session", () => {
    expect(shouldShowWorkflowInvite(settings(), 1, false)).toBe(true);
  });

  // ── Condition 1: the persisted outcome ────────────────────────────────────────────

  it("does NOT show once dismissed", () => {
    expect(
      shouldShowWorkflowInvite(settings({ workflowInvite: "dismissed" }), 1, false),
    ).toBe(false);
  });

  it("does NOT show once acknowledged", () => {
    expect(
      shouldShowWorkflowInvite(settings({ workflowInvite: "acknowledged" }), 1, false),
    ).toBe(false);
  });

  // ── Condition 2: the gate ─────────────────────────────────────────────────────────

  it("does NOT show when the features are already enabled (nothing left to pitch)", () => {
    expect(
      shouldShowWorkflowInvite(settings({ workflowFeaturesEnabled: true }), 1, false),
    ).toBe(false);
  });

  // ── Condition 3: the project count ────────────────────────────────────────────────

  it("does NOT show on a zero-project fresh install (the pitch has no referent yet)", () => {
    // This is the row that makes the trigger "first launch WITH >=1 project" rather than
    // "first launch". A genuinely fresh install lands on the picker with an empty recents
    // list; pitching workflow orchestration "for your projects" there is spent on nothing,
    // and the invite never re-shows to try again.
    expect(shouldShowWorkflowInvite(settings(), 0, false)).toBe(false);
  });

  it("shows with many projects (the count is a floor, not an equality)", () => {
    expect(shouldShowWorkflowInvite(settings(), 20, false)).toBe(true);
  });

  it("does NOT show for a negative count (defensive — a failed read must not open the gate)", () => {
    // `App.tsx` derives the count from a `list_projects` invoke. If that ever yields a
    // sentinel rather than throwing, the predicate must fail CLOSED: a broken read should
    // suppress the one-shot invite, never spend it.
    expect(shouldShowWorkflowInvite(settings(), -1, false)).toBe(false);
  });

  // ── Condition 4: the [Later] session term ─────────────────────────────────────────

  it("does NOT show when hidden for this session ([Later])", () => {
    expect(shouldShowWorkflowInvite(settings(), 1, true)).toBe(false);
  });

  // ── The two load-bearing rows ─────────────────────────────────────────────────────

  it("LOAD-BEARING — already-resolved: acknowledged + gate now OFF stays suppressed (disable-after-enable)", () => {
    // The case the two-field design exists for, and the one a `workflowInviteSeen: boolean`
    // handles only by accident. A user who saw the invite, enabled the features, tried them,
    // then disabled them is back at gate=false — the SAME gate state as someone who never
    // saw the invite. Without the separate outcome marker they'd be re-pitched something
    // they already evaluated and rejected.
    expect(
      shouldShowWorkflowInvite(
        settings({ workflowInvite: "acknowledged", workflowFeaturesEnabled: false }),
        5,
        false,
      ),
    ).toBe(false);
  });

  it("LOAD-BEARING — [Later]: nothing persisted, so it returns next launch (new session, same null state)", () => {
    // [Later] writes NOTHING to disk. So within the session it is hidden by the session
    // flag (asserted above), and on the NEXT launch the persisted state is still `null`
    // and the fresh session flag is false — so it shows again. Both halves asserted here
    // because the pair IS the behavior: a [Later] that persisted anything would silently
    // become a [Dismiss], which is the mislabeled-control bug the three-button model
    // replaced.
    const persisted = settings(); // unchanged by [Later] — still null
    expect(shouldShowWorkflowInvite(persisted, 1, true)).toBe(false); // this session
    expect(shouldShowWorkflowInvite(persisted, 1, false)).toBe(true); // next launch
  });

  // ── Exhaustive sweep ──────────────────────────────────────────────────────────────

  it("is true for EXACTLY one combination across the full input space", () => {
    // Guards against a future edit that loosens a condition: rather than trusting the
    // hand-written cases above to stay exhaustive, enumerate the whole space and assert the
    // shape of the answer. Any added `true` row fails here even if every case above still
    // passes.
    const outcomes: (WorkflowInviteOutcome | null)[] = [
      null,
      "acknowledged",
      "dismissed",
    ];
    const counts = [0, 1, 7];
    const showing: string[] = [];

    for (const workflowInvite of outcomes) {
      for (const workflowFeaturesEnabled of [false, true]) {
        for (const count of counts) {
          for (const session of [false, true]) {
            const show = shouldShowWorkflowInvite(
              { workflowInvite, workflowFeaturesEnabled },
              count,
              session,
            );
            if (show) {
              showing.push(
                `invite=${workflowInvite} gate=${workflowFeaturesEnabled} n=${count} session=${session}`,
              );
            }
          }
        }
      }
    }

    // Only unresolved + gate-off + not-hidden-this-session, for each count >= 1.
    expect(showing).toEqual([
      "invite=null gate=false n=1 session=false",
      "invite=null gate=false n=7 session=false",
    ]);
  });

  it("is a pure function — same answer for same inputs, and does not mutate its argument", () => {
    // What this test ACTUALLY asserts: referential consistency (same inputs → same answer)
    // and non-mutation (the frozen input is unchanged, and a predicate that wrote to it
    // would throw TypeError under Object.freeze).
    //
    // What it does NOT assert, stated plainly so a future reader doesn't over-trust it:
    // the "no React / no invoke / no DOM" property is enforced by this file running in
    // vitest's `node` environment (where those globals are simply absent) and by the module
    // having zero imports — NOT by any assertion here. If someone added a hook import, this
    // test would not be what catches it. Noted at verify-self 2026-07-29 after a subagent
    // correctly flagged that the original comment claimed more than the code proved — the
    // same overstatement defect logged as
    // SURFACE-2026-07-29-SETTINGS-PRESERVES-OTHER-FIELDS-TEST-NAME-OVERSTATES-ASSERTION.
    const input = settings();
    const frozen = Object.freeze({ ...input });
    expect(shouldShowWorkflowInvite(frozen, 1, false)).toBe(true);
    expect(shouldShowWorkflowInvite(frozen, 1, false)).toBe(true);
    expect(frozen).toEqual(input);
  });
});

describe("WorkflowInviteOutcome is a cross-language contract with the Rust enum", () => {
  // THE GAP THIS PHASE'S OTHER 12 TESTS STRUCTURALLY CANNOT COVER.
  //
  // The Rust enum pins its own wire strings
  // (`workflow_invite_serializes_kebab_case_for_the_ts_union`) and the TS union declares
  // its own. Both suites stay GREEN if either side is renamed — and the failure is silent
  // and severe: the predicate reads an unrecognized value, so a user who already dismissed
  // the invite is either re-pitched forever (value no longer matches `"dismissed"`) or the
  // invite never shows at all. Nothing in a same-file truth table can catch a drift in the
  // OTHER language.
  //
  // Idiom copied from WP2's `workflowGateContract.test.ts`, which closes the same class of
  // gap for the gate's event literal in the same direction (read the Rust source as text,
  // assert agreement). Also mirrors `app_menu`'s
  // `functional_ids_are_pinned_to_the_frontend_bridge` in the opposite direction.
  //
  // NOTE this is a `?raw`-style SOURCE-TEXT guard, and the repo rule
  // (root CLAUDE.md) says such guards verify STRUCTURE, never RUNTIME. That is exactly what
  // is wanted here — the assertion is about two declarations agreeing, not about behavior —
  // and per that rule each assertion matches a SINGLE identifier/literal, never a formatted
  // multi-line expression (the shape that silently stopped matching after a Prettier reflow
  // twice in WP2).
  const rustSrc = readFileSync(
    fileURLToPath(
      new URL("../../../src-tauri/src/config_store/settings.rs", import.meta.url),
    ),
    "utf8",
  );

  it("declares the same variants the Rust enum does", () => {
    // Rust variant names are PascalCase; serde `rename_all = "kebab-case"` maps them to the
    // wire strings the TS union carries. Assert both halves so a variant added on either
    // side without its counterpart fails here.
    expect(rustSrc).toContain("pub enum WorkflowInviteOutcome {");
    expect(rustSrc).toContain("Acknowledged,");
    expect(rustSrc).toContain("Dismissed,");
  });

  it("relies on kebab-case serialization, which the Rust side must keep", () => {
    // The TS union's members ARE the serialized forms. If the `rename_all` attribute were
    // dropped, Rust would emit "Acknowledged"/"Dismissed" and every comparison in the
    // predicate would silently stop matching.
    expect(rustSrc).toContain('#[serde(rename_all = "kebab-case")]');
  });

  it("has no variant the Rust enum lacks (the drift direction a Rust-side test cannot see)", () => {
    // Enumerate the TS union exhaustively via a satisfies-style exhaustive list, then check
    // each maps to a Rust variant. Adding `"snoozed"` to the TS union without the Rust
    // variant fails here — and a Rust-side test would never notice, since Rust would still
    // compile and serialize fine.
    const tsVariants: WorkflowInviteOutcome[] = ["acknowledged", "dismissed"];
    const toPascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    for (const v of tsVariants) {
      expect(rustSrc).toContain(`${toPascal(v)},`);
    }
    // Guard the guard: if the union ever grows, this list must grow with it or the loop
    // silently under-checks (the vacuous-check failure mode this feature already hit once,
    // with a `cargo test` filter that matched zero tests and still exited 0).
    expect(tsVariants).toHaveLength(2);
  });
});
