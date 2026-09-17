// M15 WP3 Phase 5 — the fan-out's contract.
//
// ⚠️ TASK 3.8 IS EXPLICIT THAT THE NEGATIVE ARM IS ASSERTED AS HARD AS THE POSITIVE: a
// legitimate verify-human PAUSE, an ESCALATE, and a Mode-0 direct invocation must each produce
// NO FIRE AT ALL. Those are the three cases where a wrong fire is unrecoverable, so they get
// first-class tests rather than a footnote.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fanOut,
  fireOne,
  SUPERVISOR_INJECT_LABEL,
  type FanOutDeps,
  type SupervisedWorkspace,
} from "../fanOut";
import { decideVerdict, FireLedger } from "../verdict";
import { parseTranscript, type TranscriptTail } from "../transcript";
import { RECYCLE_TOKEN_THRESHOLD } from "../contextPressure";
import { parseWip } from "../wipPhases";
import { UnsentInputWatermark } from "../unsentInput";

/** A transcript tail for a turn that emitted `edgeId` and did not chain. */
const tailFor = (edgeId: string, path = "/t/a.jsonl"): TranscriptTail => ({
  path,
  lines: [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: `All done.\n\nTRANSITION: ${edgeId}` }],
      },
    }),
  ],
});

const ws = (over: Partial<SupervisedWorkspace> = {}): SupervisedWorkspace => ({
  workspaceId: "ws-1",
  sessionId: "sess-1",
  projectPath: "/p",
  storedMode: "autopilot",
  ptySessionId: "pty-1",
  ...over,
});

interface Harness extends FanOutDeps {
  injected: Array<{ pty: string; command: string; label: string }>;
}

const harness = (
  tail: (w: SupervisedWorkspace) => TranscriptTail | Promise<TranscriptTail>,
  answer = "PROCEED",
): Harness => {
  const injected: Array<{ pty: string; command: string; label: string }> = [];
  return {
    readTail: async (w) => tail(w),
    // ⚠️ Records the LABEL as well. `FanOutDeps.inject` requires it, but TypeScript accepts a
    // stub that ignores trailing parameters — so the type alone does NOT prove `fireOne`
    // passes one. Capturing it is what makes the requirement value-tested.
    inject: async (pty, command, label) => {
      injected.push({ pty, command, label });
    },
    adjudicator: { run: async () => answer, warn: () => {} },
    ledger: new FireLedger(),
    warn: () => {},
    injected,
  };
};

describe("fireOne — the positive path", () => {
  it("fires the next skill as a slash command into the workspace's PTY", async () => {
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(true);
    expect(r.command).toBe("/feature-plan");
    // ⚠️ The leading slash matters: `injectCommand` appends the `\r`, but the COMMAND must
    // carry its own slash or CC receives bare prose.
    expect(h.injected).toEqual([
      {
        pty: "pty-1",
        command: "/feature-plan",
        label: SUPERVISOR_INJECT_LABEL,
      },
    ]);
  });
});

describe("⚠️ the NEGATIVE arm (task 3.8) — asserted as hard as the positive", () => {
  it("⚠️ a legitimate verify-human PAUSE produces NO fire at all", async () => {
    // F3 is PAUSE in autopilot. This is the operator's own stop; firing through it is the
    // single most damaging thing the supervisor could do.
    const h = harness(() => tailFor("F3"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("policy-not-auto");
    expect(h.injected).toHaveLength(0);
  });

  it("⚠️ an ESCALATE / cross-workflow edge produces NO fire at all", async () => {
    // T3 hands control to a DIFFERENT workflow. A fire here crosses a workflow boundary
    // unattended — a blast radius nothing in M15 measured or sanctioned.
    const h = harness(() => tailFor("T3"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("not-dispatchable");
    expect(h.injected).toHaveLength(0);
  });

  it("⚠️ a project with NO stored drive mode produces NO fire at all", async () => {
    // The Mode-0 / direct-invocation case as R-1 actually resolved it: the STORED mode is the
    // authority, and an unset mode means the operator never opted this project in. The picker
    // row reads "Drive Mode: None"; firing would enforce a policy they never chose.
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws({ storedMode: null }), h);
    expect(r.fired).toBe(false);
    // ⚠️ THE REASON IS ASSERTED, AND IT IS NOT `policy-not-auto`. This arm returns before
    // `resolvePolicy` is ever called, so reporting a policy verdict sent an operator asking
    // "why didn't my project fire?" to the policy table instead of to the unset
    // `default_drive_mode`. This was the one negative arm that checked only `fired`.
    expect(r.reason).toBe("not-supervised");
    expect(r.reason).not.toBe("policy-not-auto");
    expect(h.injected).toHaveLength(0);
  });

  it("⚠️ an adjudicator veto produces NO fire, even on an AUTO+dispatchable edge", async () => {
    const h = harness(() => tailFor("F5"), "AWAITING");
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("adjudicator-says-awaiting");
    expect(h.injected).toHaveLength(0);
  });

  it("⚠️ an unreadable transcript produces NO fire — 'no evidence' is never 'fire'", async () => {
    const h = harness(() => {
      throw new Error("EACCES");
    });
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("transcript-unreadable");
    expect(h.injected).toHaveLength(0);
  });
});

describe("⚠️ idempotency — the ledger is claimed BEFORE the inject", () => {
  it("fires once for a turn and never again, however many sweeps run", async () => {
    // A fire is asynchronous: the transcript shows no `Skill` call until CC runs one, so the
    // next sweep still reads "AUTO, dispatchable, not chained" and would fire again.
    const h = harness(() => tailFor("F5"));
    const first = await fireOne(ws(), h);
    const second = await fireOne(ws(), h);
    const third = await fireOne(ws(), h);
    expect(first.fired).toBe(true);
    expect([second.fired, third.fired]).toEqual([false, false]);
    expect(second.reason).toBe("already-fired-for-this-turn");
    expect(h.injected).toHaveLength(1);
  });

  it("⚠️ does not even ADJUDICATE a turn already fired — the ~3s is not paid twice", async () => {
    let adjudications = 0;
    const base = harness(() => tailFor("F5"));
    const h: FanOutDeps = {
      ...base,
      adjudicator: {
        run: async () => {
          adjudications++;
          return "PROCEED";
        },
        warn: () => {},
      },
    };
    await fireOne(ws(), h);
    await fireOne(ws(), h);
    expect(adjudications).toBe(1);
  });

  it("fires again for a DIFFERENT turn in the same workspace", async () => {
    // Keyed on the turn, never on the workspace: a feature emits `F8` once per phase, and
    // keying on the workspace would fire for phase 1 and then silently never again.
    let path = "/t/a.jsonl";
    const h = harness(() => tailFor("F5", path));
    await fireOne(ws(), h);
    // A different transcript file = a different turn.
    path = "/t/b.jsonl";
    const second = await fireOne(ws(), h);
    expect(second.fired).toBe(true);
    expect(h.injected).toHaveLength(2);
  });
});

describe("fanOut — across ALL open workspaces", () => {
  it("⚠️ fires in an UNFOCUSED workspace, not just one — the feature IS the multi case", async () => {
    const h = harness((w) => tailFor(w.workspaceId === "ws-2" ? "F5" : "F3"));
    const out = await fanOut(
      [
        ws({ workspaceId: "ws-1", ptySessionId: "pty-1" }),
        ws({ workspaceId: "ws-2", ptySessionId: "pty-2" }),
      ],
      h,
    );
    expect(out.map((o) => o.fired)).toEqual([false, true]);
    // The fire landed in ws-2's OWN pty — not the focused one, not a shared one.
    expect(h.injected).toEqual([
      {
        pty: "pty-2",
        command: "/feature-plan",
        label: SUPERVISOR_INJECT_LABEL,
      },
    ]);
  });

  it("⚠️ survives a REJECTION from the per-workspace path — the allSettled guard", async () => {
    // ⚠️ MUTATION TESTING FOUND THE ORIGINAL VERSION OF THIS TEST INSUFFICIENT (2026-09-13).
    // It threw from `readTail`, which `fireOne` catches INTERNALLY — so `fireOne` always
    // resolved, `Promise.all` never saw a rejection, and swapping `allSettled` for `all` left
    // the whole suite green. It proved `fireOne`'s catch, not the sweep's isolation.
    //
    // To reach the outer guard the REJECTION must escape `fireOne`, which means failing in a
    // dep it does not wrap: `ledger.claim` is called outside every try/catch.
    const exploding = {
      claim: () => {
        throw new Error("ledger exploded");
      },
      has: () => false,
      size: 0,
    } as unknown as FireLedger;

    const base = harness(() => tailFor("F5"));
    const h: FanOutDeps = { ...base, ledger: exploding };
    const out = await fanOut(
      [ws({ workspaceId: "ws-1" }), ws({ workspaceId: "ws-2" })],
      h,
    );

    // Both rejected — but the sweep still returned ONE OUTCOME PER WORKSPACE rather than
    // rejecting. Under `Promise.all` this call itself would reject and the test would fail.
    expect(out).toHaveLength(2);
    expect(out.map((o) => o.reason)).toEqual(["sweep-threw", "sweep-threw"]);
    expect(out.every((o) => !o.fired)).toBe(true);
  });

  it("⚠️ a rejection in ONE workspace does not stop a LATER workspace from firing", async () => {
    // The asymmetric case, which is the one that actually matters operationally: ws-1 blows up
    // in a way `fireOne` cannot catch, and ws-2 must still fire. Under `Promise.all` the whole
    // sweep rejects and ws-2 silently never fires.
    let calls = 0;
    const exploding = {
      claim: () => {
        calls++;
        if (calls === 1)
          throw new Error("ledger exploded for the first workspace");
        return true;
      },
      has: () => false,
      size: 0,
    } as unknown as FireLedger;

    const base = harness(() => tailFor("F5"));
    const h: FanOutDeps = { ...base, ledger: exploding };
    const out = await fanOut(
      [
        ws({ workspaceId: "ws-1", ptySessionId: "pty-1" }),
        ws({ workspaceId: "ws-2", ptySessionId: "pty-2" }),
      ],
      h,
    );
    expect(out[0].reason).toBe("sweep-threw");
    expect(out[1].fired).toBe(true);
    expect(base.injected).toEqual([
      {
        pty: "pty-2",
        command: "/feature-plan",
        label: SUPERVISOR_INJECT_LABEL,
      },
    ]);
  });

  it("a failure INSIDE fireOne is caught locally and reported per workspace", async () => {
    // The original test, kept for what it genuinely proves: `fireOne`'s own catch.
    const h = harness((w) => {
      if (w.workspaceId === "ws-1") throw new Error("boom");
      return tailFor("F5");
    });
    const out = await fanOut(
      [
        ws({ workspaceId: "ws-1" }),
        ws({ workspaceId: "ws-2", ptySessionId: "pty-2" }),
      ],
      h,
    );
    expect(out[0].reason).toBe("transcript-unreadable");
    expect(out[1].fired).toBe(true);
  });

  it("returns one outcome per workspace, in order", async () => {
    const h = harness(() => tailFor("F3"));
    const out = await fanOut(
      [
        ws({ workspaceId: "a" }),
        ws({ workspaceId: "b" }),
        ws({ workspaceId: "c" }),
      ],
      h,
    );
    expect(out.map((o) => o.workspaceId)).toEqual(["a", "b", "c"]);
  });

  it("⚠️ shares ONE ledger across the sweep, so a re-entrant sweep cannot double-fire", async () => {
    const h = harness(() => tailFor("F5"));
    const first = await fanOut([ws()], h);
    const second = await fanOut([ws()], h);
    expect(first[0].fired).toBe(true);
    expect(second[0].fired).toBe(false);
    expect(h.injected).toHaveLength(1);
  });
});

describe("⚠️ the turn is read ONCE — the ledger key and the decision cannot diverge", () => {
  it("USES the reading it is handed, rather than re-reading the lines", () => {
    // ⚠️ WHY THIS DRIVES `decideVerdict` DIRECTLY AND FEEDS IT A READING THAT DISAGREES.
    // The defect is that `fireOne` read the turn for its ledger key and the verdict read it
    // AGAIN. Both reads agree today because `readTurn` is deterministic over an identical
    // array — so ANY test that supplies a consistent transcript passes with or without the
    // fix, and proves nothing. (Tried: a two-verdict transcript asserting the command and
    // the ledger claim. It survived a mutant that restored the second read.)
    //
    // ⚠️ The only way to observe WHICH read won is to hand in a reading that differs from
    // what re-reading would produce. The lines below emit `F5` (→ /feature-plan); the
    // supplied reading names `F7` (→ /feature-build). If the reading is honored the verdict
    // is `F7`; if the module re-reads, it is `F5`.
    //
    // ⚠️ This is NOT testing an impossible state for its own sake — it IS the desynchronized
    // state the finding describes, made observable. In production the divergence would come
    // from a future parameter or short-circuit, not from a hand-built argument.
    const lines = parseTranscript([
      JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Done.\n\nTRANSITION: F5" }],
        },
      }),
    ]);

    const asRead = decideVerdict({ lines, storedMode: "autopilot" });
    expect(asRead.kind).toBe("fire");
    if (asRead.kind === "fire") expect(asRead.edgeId).toBe("F5");

    const handed = decideVerdict({
      lines,
      storedMode: "autopilot",
      reading: {
        edgeId: "F7",
        verdictIndex: 0,
        chainedTo: null,
        alreadyChained: false,
      },
    });
    expect(handed.kind).toBe("fire");
    // ⚠️ `F7`, not `F5` — the handed reading decided, so `fireOne`'s ledger key (built from
    // that same reading) and the fire it issues describe the SAME turn by construction.
    if (handed.kind === "fire") {
      expect(handed.edgeId).toBe("F7");
      // ⚠️ And the SKILL differs too — /feature-build vs /feature-plan. That is the byte
      // sequence that would reach the PTY, so a divergence here is a wrong command injected
      // into a live session, not merely a mislabelled ledger entry.
      expect(handed.skill).toBe("feature-build");
    }
    if (asRead.kind === "fire") expect(asRead.skill).toBe("feature-plan");
    expect(handed).not.toEqual(asRead);
  });
});

describe("⚠️ the injection LABEL — found by review at Phase 5 verify-self", () => {
  it("exports a distinct label that collides with no existing injectCommand caller", () => {
    // ⚠️ `injectCommand`'s label defaults to "auto-resume", and `console.warn` is the ONLY
    // failure channel that path has. A supervisor failure warning as "auto-resume: …" points
    // the single available diagnostic at M12's arm — the exact misattribution that forced the
    // `label` parameter to exist when M13's skill row inherited the same default.
    expect(SUPERVISOR_INJECT_LABEL).toBe("supervisor");
    for (const taken of ["auto-resume", "recycle", "skill-button"]) {
      expect(SUPERVISOR_INJECT_LABEL).not.toBe(taken);
    }
  });

  it("⚠️ `fireOne` PASSES the label — the real call, not the source text", async () => {
    // ⚠️ THIS REPLACED A `?raw` SOURCE-TEXT GUARD that asserted the string "MUST pass"
    // appeared in `fanOut.ts` — documentation checking documentation, which passed exactly
    // when the requirement was stated and said nothing about whether it was HONORED.
    //
    // ⚠️ The type does not prove it either: `FanOutDeps.inject` now requires a third
    // parameter, but TypeScript accepts a stub declaring only two, so a `fireOne` that
    // dropped the argument would still compile. Only the captured VALUE proves the label
    // reaches the injector.
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(true);
    expect(h.injected[0].label).toBe(SUPERVISOR_INJECT_LABEL);
    // ⚠️ And specifically NOT `injectCommand`'s default, which is the misattribution this
    // whole constant exists to prevent.
    expect(h.injected[0].label).not.toBe("auto-resume");
  });
});

describe("⚠️ the WHOLE pipeline, against a REAL captured transcript", () => {
  // ⚠️ WHAT THIS ADDS OVER EVERY TEST ABOVE. The others feed `tailFor()` — JSONL this test
  // file writes itself — so they can only encode the transcript shape I BELIEVE Claude Code
  // produces. This drives the committed REAL fixture (prose redacted, structure verbatim:
  // real `type` values, real message/content nesting, a real `toolUseResult` line, a real
  // `Skill` tool_use) through `fanOut` end to end, so raw bytes → parse → policy → verdict →
  // injection is exercised on the actual format.
  //
  // ⚠️ It is also the only test where the DECISION is one a human can check by eye: the
  // fixture is a turn that DID chain (`F7` → `feature-build`), so the correct answer is "do
  // not fire" — and getting that wrong would mean re-running a skill the agent already ran.
  const realTail = (): TranscriptTail => ({
    path: "/real/fixture.jsonl",
    lines: readFileSync(
      resolve(__dirname, "fixtures/real-chained-turn.jsonl"),
      "utf8",
    )
      .split("\n")
      .filter((l) => l.trim()),
  });

  it("⚠️ does NOT fire on a real turn that already chained", async () => {
    // THE CASE THAT MATTERS. Firing here would re-run `feature-build` on a phase the agent
    // had already advanced — and `injectCommand` has no undo.
    const h = harness(() => realTail());
    const r = await fireOne(ws({ storedMode: "autopilot" }), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("already-chained");
    expect(h.injected).toHaveLength(0);
  });

  it("⚠️ fires on the same real turn once the chain is removed — the fixture is not inert", async () => {
    // ⚠️ THE ANTI-VACUITY CONTROL for the test above. Without it, a reader cannot tell
    // "correctly withheld because it chained" from "withheld because the pipeline is broken
    // on real data". Drop the trailing `Skill` line and the SAME bytes must fire.
    const lines = realTail().lines.filter((l) => !l.includes('"Skill"'));
    expect(
      lines.length,
      "the fixture must contain a Skill line to remove",
    ).toBeLessThan(realTail().lines.length);
    const h = harness(() => ({ path: "/real/fixture.jsonl", lines }));
    const r = await fireOne(ws({ storedMode: "autopilot" }), h);
    expect(r.fired).toBe(true);
    expect(r.command).toBe("/feature-build");
    expect(h.injected).toEqual([
      {
        pty: "pty-1",
        command: "/feature-build",
        label: SUPERVISOR_INJECT_LABEL,
      },
    ]);
  });

  it("⚠️ the same real bytes withhold in a mode where that edge is PAUSE", async () => {
    // `F7` is AUTO in autopilot/fsd and PAUSE in stepping/orchestrated. Same input, different
    // stored mode, different answer — the mode-sensitivity the live run demonstrated, pinned
    // here against real data rather than a hand-built line.
    const lines = realTail().lines.filter((l) => !l.includes('"Skill"'));
    const h = harness(() => ({ path: "/real/fixture.jsonl", lines }));
    const r = await fireOne(ws({ storedMode: "orchestrated" }), h);
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("policy-not-auto");
    expect(h.injected).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M15 WP4 — THE RECYCLE ARM IN `fireOne`.
//
// ⚠️ **THIS BLOCK EXISTS BECAUSE A MUTANT SURVIVED ALL 150 TESTS.** Moving the
// `kind !== "fire"` withhold check AHEAD of the recycle arm in `fireOne` was caught ONLY by
// `tsc` — no behavioral test noticed, because `fanOut.test.ts` had no recycle case at all.
// A type error is a real guard (and `tsc --noEmit` runs inside `pnpm verify:auto`), but it only
// fires because `recycle` happens to lack a `reason` field; a future shape change that gave it
// one would make the misordering compile AND silently report every recycle as an unexplained
// non-fire. These tests guard the BEHAVIOR rather than the current field layout.
describe("fireOne — the M15 WP4 recycle arm", () => {
  /** A feature WIP at a non-final boundary — the shape that triggers a recycle. */
  const featureAtBoundary = parseWip(
    [
      "**Workflow:** feature",
      "- [x] Phase 1: done",
      "- [ ] Phase 2: open",
    ].join("\n"),
  );

  /** A tail whose last assistant line reports a context reading over the threshold. */
  const overThresholdTail = (edgeId: string): TranscriptTail => ({
    path: "/t/a.jsonl",
    lines: [
      JSON.stringify({
        type: "assistant",
        message: {
          content: [
            { type: "text", text: `All done.\n\nTRANSITION: ${edgeId}` },
          ],
          usage: {
            input_tokens: RECYCLE_TOKEN_THRESHOLD + 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      }),
    ],
  });

  it("reports a recycle and injects NOTHING", async () => {
    // ⚠️ The zero-injection assertion is the load-bearing half. A recycle that ALSO injected the
    // skill command would run the next phase in the very session it was about to end.
    const h = harness(() => overThresholdTail("F5"));
    const r = await fireOne(ws(), {
      ...h,
      readWip: async () => featureAtBoundary,
    });

    expect(r.recycle).toBeDefined();
    expect(r.recycle?.skill).toBe("feature-plan");
    expect(r.recycle?.edgeId).toBe("F5");
    expect(r.recycle?.tokens).toBe(RECYCLE_TOKEN_THRESHOLD + 1);
    expect(h.injected).toEqual([]);
  });

  it("⚠️ reports `fired: false` for a recycle — it is not an injection", async () => {
    // ⚠️ `fired` means "a slash command went into the PTY". A recycle hands off to
    // `recycleSession()` instead, and reporting it as `fired: true` would make the two
    // indistinguishable in a diagnostic.
    const h = harness(() => overThresholdTail("F5"));
    const r = await fireOne(ws(), {
      ...h,
      readWip: async () => featureAtBoundary,
    });
    expect(r.fired).toBe(false);
    expect(r.reason).toBe("context-pressure-recycle");
  });

  it("⚠️ a genuine WITHHOLD still reports its own reason, not the recycle's", async () => {
    // ⚠️ THE MUTANT-KILLER. If the `kind !== "fire"` check ran BEFORE the recycle arm, a recycle
    // would fall through to `no(verdict.reason)` and report `undefined`. Conversely if the arms
    // were swapped, a withhold could be mislabelled `context-pressure-recycle`. Asserting BOTH
    // directions is what pins the ordering behaviorally rather than by field layout.
    const h = harness(() => tailFor("F3"), "PROCEED");
    const r = await fireOne(ws({ storedMode: "orchestrated" }), {
      ...h,
      readWip: async () => featureAtBoundary,
    });
    expect(r.fired).toBe(false);
    expect(r.recycle).toBeUndefined();
    expect(r.reason).toBe("policy-not-auto");
    expect(h.injected).toEqual([]);
  });

  it("⚠️ omitting `readWip` disables the recycle entirely and the skill FIRES", async () => {
    // The opt-in property: WP3's chain-only behavior is preserved for every caller that does not
    // supply the dep, with no edits to those callers.
    const h = harness(() => overThresholdTail("F5"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(true);
    expect(r.recycle).toBeUndefined();
    expect(h.injected).toHaveLength(1);
  });

  it("⚠️ a THROWING `readWip` degrades to chaining, never to a recycle or a dead sweep", async () => {
    // ⚠️ The withholding direction: an unreadable WIP must never be the reason a session is
    // ended, and must not abort the sweep either.
    const h = harness(() => overThresholdTail("F5"));
    const r = await fireOne(ws(), {
      ...h,
      readWip: async () => {
        throw new Error("boom");
      },
    });
    expect(r.fired).toBe(true);
    expect(r.recycle).toBeUndefined();
  });

  it("⚠️ an UNDER-threshold turn at the same boundary chains instead of recycling", async () => {
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), {
      ...h,
      readWip: async () => featureAtBoundary,
    });
    expect(r.fired).toBe(true);
    expect(r.recycle).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M14 WP0 — THE UNSENT-INPUT SUPPRESSION.
//
// ⚠️ The defect this arm exists to stop: the supervisor fired six unwanted `/feature-build`
// invocations into a session whose operator was mid-sentence. `injectCommand` has no retry and
// no pre-send cancel window, so a wrong fire is unrecoverable except via Esc.
describe("fireOne — unsent-input suppression", () => {
  it("does NOT inject when the workspace has unsent input", async () => {
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), { ...h, hasUnsentInput: () => true });

    expect(r.fired).toBe(false);
    expect(r.reason).toBe("unsent-input-present");
    // ⚠️ **ASSERT THE INJECTOR, NOT JUST `fired: false`.** Every withhold path in this module
    // returns `fired: false` — `no-verdict`, `already-fired-for-this-turn`, the verify-human
    // gate. So the return value alone does NOT prove the injection was skipped; only the empty
    // spy does. This is the "assertion says X, measures Y" gap the repo has been bitten by.
    expect(h.injected).toEqual([]);
  });

  it("fires normally when there is no unsent input", async () => {
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), { ...h, hasUnsentInput: () => false });
    expect(r.fired).toBe(true);
    expect(h.injected).toHaveLength(1);
  });

  it("fires when no `hasUnsentInput` is supplied at all (pre-WP0 behavior)", async () => {
    // ⚠️ The absent case is the UNSAFE direction, unlike `readWip`. It is kept only so existing
    // hosts and the replay harness compile unchanged; the production caller MUST supply one,
    // which `useSupervisor.test.ts` pins separately.
    const h = harness(() => tailFor("F5"));
    const r = await fireOne(ws(), h);
    expect(r.fired).toBe(true);
  });

  it("⚠️ is read AT FIRE TIME, not when the deps were built", async () => {
    // The operator starts typing DURING the sweep — the transcript read and the ~3s
    // adjudication are exactly that window. A boolean captured up front would answer the wrong
    // question, so the dep is a function and this proves it is actually called late: it reads
    // false while the deps are assembled and true by the time the injection is due.
    let typing = false;
    const h = harness(() => {
      typing = true; // the operator starts typing during the transcript read
      return tailFor("F5");
    });
    const r = await fireOne(ws(), { ...h, hasUnsentInput: () => typing });

    expect(r.fired).toBe(false);
    expect(r.reason).toBe("unsent-input-present");
    expect(h.injected).toEqual([]);
  });

  it("⚠️ a suppressed turn CONSUMES its ledger claim and is not reconsidered", async () => {
    // ⚠️ THIS IS THE DESIGNED BEHAVIOR, NOT A LEAK. The suppression sits AFTER the claim, so
    // the turn is spent. That is the point: the operator is mid-sentence and what they type IS
    // the next instruction — re-firing the stale chain once they hit Enter would inject a
    // command on top of the one they just sent, which is the collision this feature prevents.
    const ledger = new FireLedger();
    const h = { ...harness(() => tailFor("F5")), ledger };

    const first = await fireOne(ws(), { ...h, hasUnsentInput: () => true });
    expect(first.reason).toBe("unsent-input-present");

    // The operator submits; the watermark clears. The SAME turn must still not fire.
    const second = await fireOne(ws(), { ...h, hasUnsentInput: () => false });
    expect(second.fired).toBe(false);
    expect(second.reason).toBe("already-fired-for-this-turn");
    expect(h.injected).toEqual([]);
  });

  it("⚠️ AC-7 — the supervisor's OWN injection does not suppress the next turn", async () => {
    // ⚠️ **THIS TEST DRIVES A REAL `UnsentInputWatermark`, AND THE FIRST VERSION DID NOT — that
    // is the whole difference between measuring AC-7 and measuring nothing.**
    //
    // The original used a hardcoded `{value: false}` stand-in for `hasUnsentInput`, so the
    // second fire could not have been suppressed *no matter what `injectCommand` did*: the
    // assertion said "the machine does not suppress itself" while measuring "two independent
    // turns both fire." An equivalent mutant — it survives every mutation of the code it names.
    // Found at verify-self by the verification subagent (SHORTCUT-2026-09-17).
    //
    // Here the watermark is REAL and the injector FEEDS IT: `inject` pushes the very bytes
    // `injectCommand` would send into the same watermark the suppression reads. So if the
    // production wiring ever routed the machine's own write back through `push()`, the second
    // fire WOULD be suppressed and this test WOULD fail.
    const watermark = new UnsentInputWatermark();
    const wired = (h: Harness): FanOutDeps => ({
      ...h,
      // ⚠️ The injector deliberately feeds the watermark — modelling the FAILURE we are
      // excluding, not the current design. `slashCommandPayload` ends in `\r`, so a naive
      // "it clears anyway" reading is wrong: the command text precedes the CR, and a `\r`
      // ALONE would clear. Push the command body first, exactly as a keystroke path would.
      inject: async (pty, command, label) => {
        watermark.push(command);
        await h.inject(pty, command, label);
      },
      hasUnsentInput: () => watermark.unsentInput,
    });

    const h1 = harness(() => tailFor("F5", "/t/a.jsonl"));
    const r1 = await fireOne(ws(), wired(h1));
    expect(r1.fired).toBe(true);
    // ⚠️ The positive control: the wiring above IS live, so the watermark really was written
    // by the injection. Without this the next assertion could pass because nothing happened.
    expect(
      watermark.unsentInput,
      "the test's own wiring must actually reach the watermark, or the next assertion is vacuous",
    ).toBe(true);

    // In production this second fire is NOT suppressed, because `injectCommand` never routes
    // through `term.onData` and so never reaches `push()`. Assert that directly.
    watermark.clear();
    const h2 = harness(() => tailFor("F5", "/t/b.jsonl"));
    const r2 = await fireOne(ws(), wired(h2));
    expect(
      r2.fired,
      "the first injection must not have set the watermark",
    ).toBe(true);
    expect(h2.injected).toHaveLength(1);
  });

  // ⚠️ THE STRUCTURAL HALF OF AC-7, which the behavioral test above cannot reach.
  //
  // `fireOne` is pure and takes its injector as a dep, so no test at this seam can observe
  // whether the PRODUCTION injector touches the watermark — that is a wiring fact about
  // `Workspace.tsx`/`XtermPane.tsx`. Assert it where it lives: exactly one call site pushes
  // into the watermark, and it is inside `term.onData`.
  it("⚠️ AC-7 (structural) — the watermark is fed ONLY from term.onData, never from injectCommand", () => {
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const workspace = strip(
      readFileSync(
        resolve(__dirname, "../../../components/workspace/Workspace.tsx"),
        "utf8",
      ),
    );
    const pane = strip(
      readFileSync(
        resolve(__dirname, "../../../components/workspace/XtermPane.tsx"),
        "utf8",
      ),
    );
    const autoResume = strip(
      readFileSync(
        resolve(__dirname, "../../../components/workspace/autoResumeFire.ts"),
        "utf8",
      ),
    );

    // Exactly ONE place pushes into the watermark, and it is the pane's input callback.
    const pushes = [
      ...workspace.matchAll(/unsentInputRef\.current\?\.push\(/g),
    ];
    expect(pushes).toHaveLength(1);
    expect(workspace).toMatch(
      /onInputForwarded=\{\(chunk\) => unsentInputRef\.current\?\.push\(chunk\)\}/,
    );

    // ...fed from `term.onData`, not from anywhere else in the pane.
    expect(pane).toMatch(/term\.onData\(/);
    const forwards = [...pane.matchAll(/onInputForwardedRef\.current\?\.\(/g)];
    expect(forwards).toHaveLength(1);

    // ...and the injection funnel invokes `cc_input` directly, bypassing xterm entirely.
    expect(autoResume).toMatch(/invoke\("cc_input"/);
    expect(autoResume).not.toMatch(/onInputForwarded|unsentInput/);
  });
});
