import { describe, expect, it } from "vitest";
import {
  actionFromAnnounced,
  announcementFor,
  INJECT_SETTLE_MS,
  predictAction,
  requiresInjection,
  type AutoResumeAction,
} from "../predictAction";

// M12 WP3 Phase 2 — the decision function's contract.
//
// Everything here drives the REAL imported `predictAction`, never a replica. That is the
// standing method (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`):
// a test that re-implements the decision shares its blind spot and passes while the
// shipped code is wrong.

/**
 * Every `kind` the action vocabulary declares, plus `"null"` for the no-action arm.
 *
 * ⚠️ **Derived from the type, not typed by hand.** The `satisfies` clause below makes this
 * list and `AutoResumeAction` prove each other: a member added to the union but omitted
 * here fails to compile (the union's kind is no longer assignable), and a member added to
 * both without a producer fails `no dead members` at runtime.
 *
 * This exists because the hand-written literal it replaces was measured to be a hole — see
 * that test's comment. The lesson generalizes past this file: a test that compares real
 * output against a list the test author typed can only catch the direction the author was
 * thinking about.
 */
const DECLARED_KINDS = [
  "argv",
  "inject",
  "null",
] as const satisfies ReadonlyArray<
  NonNullable<AutoResumeAction>["kind"] | "null"
>;

// The other half of the pair: every declared kind must be assignable to the literal list,
// so a NEW union member that is not listed above is a compile error rather than a silent
// pass. (`satisfies` alone only checks the listed values are valid, not that they are
// exhaustive — this line is what makes it bidirectional.)
type DeclaredKind = (typeof DECLARED_KINDS)[number];
type _EveryKindIsDeclared =
  NonNullable<AutoResumeAction>["kind"] extends DeclaredKind ? true : never;
const _exhaustive: _EveryKindIsDeclared = true;
void _exhaustive;

describe("predictAction — the four input combinations", () => {
  // The function is total over a 2-bool domain, so the table IS exhaustive. Stated as a
  // table rather than four prose tests so a missing row is visible.
  const cases: Array<{
    uncleanFlag: boolean;
    sessionMdPresent: boolean;
    expected: AutoResumeAction;
    why: string;
  }> = [
    {
      uncleanFlag: true,
      sessionMdPresent: false,
      expected: { kind: "argv", flag: "--continue" },
      why: "flag alone → continue the conversation via spawn argv",
    },
    {
      uncleanFlag: true,
      sessionMdPresent: true,
      expected: { kind: "argv", flag: "--continue" },
      why: "BOTH → the flag wins (the precedence, asserted again below)",
    },
    {
      uncleanFlag: false,
      sessionMdPresent: true,
      expected: { kind: "inject", command: "/session-restore" },
      why: "pointer alone → inject the restore command",
    },
    {
      uncleanFlag: false,
      sessionMdPresent: false,
      expected: null,
      why: "neither → nothing fires; /session-start is never auto-fired",
    },
  ];

  for (const { uncleanFlag, sessionMdPresent, expected, why } of cases) {
    it(`unclean=${uncleanFlag}, sessionMd=${sessionMdPresent} → ${JSON.stringify(expected)} (${why})`, () => {
      expect(predictAction({ uncleanFlag, sessionMdPresent })).toEqual(
        expected,
      );
    });
  }
});

describe("precedence — the unclean flag beats .session.md", () => {
  it("the unclean flag wins when BOTH signals are present", () => {
    // ⚠️ THE MUTATION TARGET. Swapping the two branches in `predictAction` makes this
    // fail. It is asserted on its own — not merely as a row in the table above — because
    // the roadmap specifies the OPPOSITE order ("both present → prefer /session-resume,
    // workflow context is richer"), so a future reader has a written invitation to
    // reverse it.
    //
    // Operator's reason (2026-08-03), which is what makes this direction correct: the
    // unclean flag is an EXPLICIT user signal (they hit the ⏸, or the machine died
    // mid-flight); `.session.md` is SEMI-AUTOMATED — written by a skill. Explicit intent
    // outranks a file a tool wrote.
    const both = predictAction({ uncleanFlag: true, sessionMdPresent: true });

    expect(both).toEqual({ kind: "argv", flag: "--continue" });
    // Stated negatively too: if the branches were swapped this would be the inject arm,
    // and `toEqual` above would already fail — but naming the wrong answer makes the
    // failure message say what went wrong rather than just diffing two objects.
    expect(both?.kind).not.toBe("inject");
  });

  it("removing either signal still yields that signal's own arm", () => {
    // Guards a degenerate "always return argv" implementation, which would satisfy the
    // precedence test above while breaking arm 2 entirely.
    expect(
      predictAction({ uncleanFlag: true, sessionMdPresent: false })?.kind,
    ).toBe("argv");
    expect(
      predictAction({ uncleanFlag: false, sessionMdPresent: true })?.kind,
    ).toBe("inject");
  });
});

describe("every arm of the action vocabulary has a real caller", () => {
  // ⚠️ WP2's lesson, paid in full and now guarded. `CleanExitRoute::CcExitCommand` was
  // declared in the Rust enum, the TS union, and round-tripped in two test suites while
  // NOTHING called it — and the exhaustiveness test's green read as coverage. The set was
  // proven complete; that each member was REACHABLE was never tested.
  //
  // So: assert reachability from the real function, not membership in a type.

  it("the argv arm is reachable, and only via a real input", () => {
    const reached = predictAction({
      uncleanFlag: true,
      sessionMdPresent: false,
    });
    expect(reached).not.toBeNull();
    expect(reached?.kind).toBe("argv");
  });

  it("the inject arm is reachable, and only via a real input", () => {
    const reached = predictAction({
      uncleanFlag: false,
      sessionMdPresent: true,
    });
    expect(reached).not.toBeNull();
    expect(reached?.kind).toBe("inject");
  });

  it("the null arm is reachable", () => {
    expect(
      predictAction({ uncleanFlag: false, sessionMdPresent: false }),
    ).toBeNull();
  });

  it("every declared kind is produced by some input — no dead members", () => {
    // ⚠️ REWRITTEN at verify-self (2026-08-04) after a subagent MUTATED the union and this
    // test stayed green. The first version compared `produced` against a **hardcoded
    // literal** `["argv","inject","null"]` — so it caught a *removed producer* but not an
    // *added dead member*, which is the exact WP2 defect direction it cites. Adding
    // `DeadAction = {kind:"deadarm"}` to `AutoResumeAction` passed all 23 tests.
    //
    // The fix is to compare the produced set against the **declared** vocabulary rather
    // than against a literal I typed. `DECLARED_KINDS` below is derived from the type via
    // `satisfies`, so adding a member to `AutoResumeAction` without adding it here is a
    // COMPILE error, and adding it to both without a producer fails THIS test at runtime.
    // Neither escape route stays silent.
    const produced = new Set(
      [true, false].flatMap((uncleanFlag) =>
        [true, false].map(
          (sessionMdPresent) =>
            predictAction({ uncleanFlag, sessionMdPresent })?.kind ?? "null",
        ),
      ),
    );
    expect([...produced].sort()).toEqual([...DECLARED_KINDS].sort());
  });
});

describe("the two arms are different KINDS of action (Phase 1's verdict)", () => {
  const argv = predictAction({ uncleanFlag: true, sessionMdPresent: false });
  const inject = predictAction({ uncleanFlag: false, sessionMdPresent: true });

  // ⚠️ These formerly also asserted `spawnArgvFor(...)`, a TS producer of the `--continue`
  // argv. It was DELETED at Phase 4 verify-codify: it had zero production callers, and its own
  // doc-claim ("keep this the ONLY place the flag string is produced") had become false —
  // `CC_ARG_CONTINUE` in `cc_session/mod.rs:66` is the real and only producer, because the argv
  // arm is resolved in Rust so that firing can consume the flag atomically. Deleted rather than
  // re-attributed, per WP2's precedent for a symbol whose predicted consumer never materialized.
  // The PROPERTY those assertions protected — the two arms are different KINDS — survives below
  // via `kind` and `requiresInjection`, which have real callers.

  it("arm 1 is the ARGV kind and needs NO injection", () => {
    expect(argv?.kind).toBe("argv");
    expect(requiresInjection(argv)).toBe(false);
  });

  it("arm 2 is the INJECT kind and needs injection", () => {
    expect(inject?.kind).toBe("inject");
    expect(requiresInjection(inject)).toBe(true);
  });

  it("the null arm needs neither", () => {
    // Asserted through the REAL predictor rather than a hand-written `null`, so this fails if
    // the no-signal case ever starts producing an action. `expect(null).toBeNull()` was the
    // first draft here and is vacuous — it tests the literal, not the code.
    const none = predictAction({ uncleanFlag: false, sessionMdPresent: false });
    expect(none).toBeNull();
    expect(requiresInjection(none)).toBe(false);
  });

  it("arm 2's command is /session-restore — NOT /session-resume, which does not exist", () => {
    // Renamed at WP5/M9 specifically to avoid colliding with the built-in `/resume` this
    // feature also reasons about. A stale `/session-resume` string was still asserted in
    // a Rust test until WP2 fixed it, so the wrong name has real precedent here.
    expect(inject).toEqual({ kind: "inject", command: "/session-restore" });
  });

  it("arm 1 never produces an injected /resume", () => {
    // The specific defect Phase 1 caught: a bare `/resume` opens an interactive session
    // picker rather than resuming, so it must never be what arm 1 types.
    expect(requiresInjection(argv)).toBe(false);
    expect(JSON.stringify(argv)).not.toContain("/resume");
  });
});

describe("announcementFor — what the row displays", () => {
  it("announces the literal command for the inject arm", () => {
    expect(
      announcementFor(
        predictAction({ uncleanFlag: false, sessionMdPresent: true }),
      ),
    ).toBe("/session-restore");
  });

  it("announces 'continue' for the argv arm, not the raw flag and not /resume", () => {
    // A row reading `--continue` would be meaningless to a reader, and `/resume` would
    // name a command that opens a picker — the exact thing this design avoids.
    const label = announcementFor(
      predictAction({ uncleanFlag: true, sessionMdPresent: false }),
    );
    expect(label).toBe("continue");
    expect(label).not.toContain("--");
    expect(label).not.toContain("/resume");
  });

  it("announces NOTHING when no action is predicted", () => {
    expect(announcementFor(null)).toBeNull();
  });
});

describe("INJECT_SETTLE_MS — the measured margin", () => {
  it("is 1500ms, comfortably above the 350ms cliff the probe measured", () => {
    // Not a style assertion. The probe measured NOT-EXECUTED 5/5 at spawn time and
    // UNRELIABLE at 350ms (1/5 then 0/5 across two independent samples). 400ms passed
    // 5/5 — i.e. the cliff is ~50ms wide, which is why the shipped value is ~4x clear of
    // it rather than just past it. Lowering this needs a fresh probe run, not a guess.
    expect(INJECT_SETTLE_MS).toBe(1500);
    expect(INJECT_SETTLE_MS).toBeGreaterThanOrEqual(1200);
  });
});

describe("actionFromAnnounced — the wire→kind seam", () => {
  it("maps the wire vocabulary onto the SAME actions predictAction produces", () => {
    // The property that matters: the batch command's answer and the click path's answer
    // must be the same typed value, or the two could diverge on what "continue" means.
    expect(actionFromAnnounced("continue")).toEqual(
      predictAction({ uncleanFlag: true, sessionMdPresent: false }),
    );
    expect(actionFromAnnounced("restore")).toEqual(
      predictAction({ uncleanFlag: false, sessionMdPresent: true }),
    );
  });

  it("an absent key means no prediction", () => {
    expect(actionFromAnnounced(undefined)).toBeNull();
  });

  it("an unrecognized value fails toward no-auto-fire rather than guessing", () => {
    // A stale frontend against a newer backend must announce nothing, not pick an arm.
    expect(
      actionFromAnnounced(
        "resume" as unknown as Parameters<typeof actionFromAnnounced>[0],
      ),
    ).toBeNull();
  });

  it("the wire vocabulary is neither a slash command nor a raw flag", () => {
    // Mirrors the Rust-side assertion, so a change on either side is caught on both.
    for (const v of ["continue", "restore"] as const) {
      expect(v.startsWith("/")).toBe(false);
      expect(v.startsWith("-")).toBe(false);
    }
  });
});
