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
import { FireLedger } from "../verdict";
import type { TranscriptTail } from "../transcript";

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
  injected: Array<{ pty: string; command: string }>;
}

const harness = (
  tail: (w: SupervisedWorkspace) => TranscriptTail | Promise<TranscriptTail>,
  answer = "PROCEED",
): Harness => {
  const injected: Array<{ pty: string; command: string }> = [];
  return {
    readTail: async (w) => tail(w),
    inject: async (pty, command) => {
      injected.push({ pty, command });
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
    expect(h.injected).toEqual([{ pty: "pty-1", command: "/feature-plan" }]);
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
    expect(h.injected).toEqual([{ pty: "pty-2", command: "/feature-plan" }]);
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
    expect(base.injected).toEqual([{ pty: "pty-2", command: "/feature-plan" }]);
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

  it("⚠️ the wiring site is REQUIRED to pass it — asserted against the real source", () => {
    // ⚠️ A constant nobody passes is documentation, not a guard. Until a production caller
    // exists this asserts the contract is at least STATED where the wiring happens; once
    // `FanOutDeps.inject` is wired (Phase 6 / WP4), extend this to assert the call site
    // actually passes it.
    const src = readFileSync(
      resolve(__dirname, "../fanOut.ts"),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(
      src,
      "the inject dep must carry the label requirement where a wiring author will read it",
    ).toContain("MUST pass");
    expect(src).toContain("SUPERVISOR_INJECT_LABEL");
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
    expect(h.injected).toEqual([{ pty: "pty-1", command: "/feature-build" }]);
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
