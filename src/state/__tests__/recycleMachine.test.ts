import { describe, expect, it } from "vitest";
import {
  initialRecycleState,
  isFreshWrite,
  isTempArtifactPath,
  isTerminal,
  recycleTransition,
  type RecycleSignal,
  type RecycleState,
} from "../recycleMachine";

// M13 WP3 Phase 1 — the Recycle completion machine's contract.
//
// Everything here drives the REAL imported machine, never a replica
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`): a test that
// re-implements the decision shares its blind spot and passes while the shipped code is wrong.
//
// ⚠️ The three run shapes below are TRANSCRIBED FROM WP1's CAPTURED LOGS, not invented. Their
// value is that they are the sequences a live CC actually produced — including run 2, the
// failure shape that a plausible implementation gets wrong. Evidence:
// `workflow-system/state/archive/m13-wp1-probe.md` → "Phase 2 — Q3".

/** Drive a whole signal sequence through the machine from its start state. */
function drive(
  signals: readonly RecycleSignal[],
  baselineMtimeMs: number | null,
): RecycleState {
  return signals.reduce<RecycleState>(
    (state, signal) => recycleTransition(state, signal, baselineMtimeMs),
    initialRecycleState(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The three captured runs, end to end.
// ─────────────────────────────────────────────────────────────────────────────

describe("the three WP1-captured runs, driven end to end", () => {
  it("run 1 (no pre-existing .session.md → handoff written) SUCCEEDS", () => {
    // Captured: no `.session.md` at t=0; write at 39.669s; Stop at 51.860s (a 12.19s tail).
    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 39_669,
          path: "workflow-system/state/.session.md",
        },
        { kind: "stop" },
      ],
      null, // no baseline — the file did not exist
    );
    expect(state).toEqual({ phase: "succeeded" });
  });

  it("⚠️ run 2 (CC REFUSED — clean Stop, nothing written) FAILS with no-fresh-write", () => {
    // Captured: `SessionStart → UserPromptSubmit → Stop → SessionEnd`, ZERO tool calls, no
    // writes at all. A stale `.session.md` WAS present at t=0 — so an existence check would
    // have said "yes" and a bare-`Stop` wait would have said "done". Both are wrong, and both
    // would have killed a session whose handoff never happened.
    const state = drive([{ kind: "stop" }], 1_000);
    expect(state).toEqual({ phase: "failed", reason: "no-fresh-write" });
  });

  it("run 3 (stale .session.md, then a real overwrite) SUCCEEDS on the fresh write", () => {
    // Captured: stale pointer present at t=0 (delta 102s); write at 28.328s; Stop at 37.341s
    // (a 9.01s tail). The baseline is what distinguishes this from run 2.
    const staleBaseline = 28_328 - 102_000;
    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 28_328,
          path: "workflow-system/state/.session.md",
        },
        { kind: "stop" },
      ],
      staleBaseline,
    );
    expect(state).toEqual({ phase: "succeeded" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The ordering constraint — the property the whole design exists for.
// ─────────────────────────────────────────────────────────────────────────────

describe("the ordering constraint: a fresh write must PRECEDE the Stop", () => {
  it("⚠️ a STALE write followed by Stop FAILS — it must not be mistaken for run 3", () => {
    // The single most dangerous confusion: the file IS there and a Stop DID arrive, but the
    // write predates this Recycle. Without the strict mtime comparison this is indistinguishable
    // from success, and the operator loses the session's work.
    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 5_000,
          path: "workflow-system/state/.session.md",
        },
        { kind: "stop" },
      ],
      9_000, // baseline is NEWER than the write → stale
    );
    expect(state).toEqual({ phase: "failed", reason: "no-fresh-write" });
  });

  it("a fresh write ALONE does not succeed — it waits out the 9–12s tail", () => {
    // Firing here is the roadmap's trap: it kills CC mid-skill, truncating the WIP annotation
    // the skill writes AFTER the pointer lands.
    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 39_669,
          path: "workflow-system/state/.session.md",
        },
      ],
      null,
    );
    expect(state).toEqual({
      phase: "awaiting-stop",
      freshWriteMtimeMs: 39_669,
    });
    expect(isTerminal(state)).toBe(false);
  });

  it("Stop-then-fresh-write does NOT succeed — the reversed order is still a failure", () => {
    // Terminal states absorb later signals, so the late write cannot resurrect the run.
    const state = drive(
      [
        { kind: "stop" },
        {
          kind: "session-md-write",
          mtimeMs: 99_999,
          path: "workflow-system/state/.session.md",
        },
      ],
      null,
    );
    expect(state).toEqual({ phase: "failed", reason: "no-fresh-write" });
  });

  it("a stale write does not advance the machine, and a later fresh one still works", () => {
    // A stale write is not an error — it is simply not our evidence. The machine keeps waiting.
    const afterStale = recycleTransition(
      initialRecycleState(),
      {
        kind: "session-md-write",
        mtimeMs: 5_000,
        path: "workflow-system/state/.session.md",
      },
      9_000,
    );
    expect(afterStale).toEqual({ phase: "awaiting-fresh-write" });

    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 5_000,
          path: "workflow-system/state/.session.md",
        }, // stale — ignored
        {
          kind: "session-md-write",
          mtimeMs: 12_000,
          path: "workflow-system/state/.session.md",
        }, // fresh
        { kind: "stop" },
      ],
      9_000,
    );
    expect(state).toEqual({ phase: "succeeded" });
  });

  it("the SECOND Stop is what completes it when a Stop precedes the fresh write", () => {
    // ⚠️ Guards the "Stop fires on every turn end" trap from the other direction: an early Stop
    // is a FAILURE, not a signal to ignore. Documented as the machine's actual behavior so a
    // future reader does not "fix" the machine into tolerating a leading Stop.
    const state = drive(
      [
        { kind: "stop" }, // an unrelated turn end BEFORE any write
        {
          kind: "session-md-write",
          mtimeMs: 39_669,
          path: "workflow-system/state/.session.md",
        },
        { kind: "stop" },
      ],
      null,
    );
    expect(state).toEqual({ phase: "failed", reason: "no-fresh-write" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Freshness predicate.
// ─────────────────────────────────────────────────────────────────────────────

describe("isFreshWrite — the baseline comparison", () => {
  it("treats any write as fresh when no .session.md existed (run 1)", () => {
    expect(isFreshWrite(1, null)).toBe(true);
    expect(isFreshWrite(0, null)).toBe(true);
  });

  it("is STRICTLY greater — an equal mtime is the same write the baseline saw", () => {
    // `>=` would silently accept the stale file in the same-millisecond case. That is the exact
    // failure the baseline exists to prevent, so the boundary is pinned.
    expect(isFreshWrite(1_000, 1_000)).toBe(false);
    expect(isFreshWrite(1_001, 1_000)).toBe(true);
    expect(isFreshWrite(999, 1_000)).toBe(false);
  });

  it("accepts run 3's real 102s delta", () => {
    expect(isFreshWrite(28_328, 28_328 - 102_000)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Temp-artifact exclusion.
// ─────────────────────────────────────────────────────────────────────────────

describe("⚠️ the temp exclusion THROUGH THE MACHINE (not just the predicate)", () => {
  // These are the assertions Outcome 4 actually asks for: "a `*.tmp.*` path event FED TO THE
  // MACHINE is ignored (STATE UNCHANGED)". An earlier revision satisfied only the predicate in
  // isolation while `RecycleSignal` had no path field at all — so the exclusion was dead code a
  // caller was free to forget, and the machine would have accepted a temp artifact as a real
  // fresh write. Predicate-level tests cannot catch that; only transition-level ones can.
  const TEMP =
    "workflow-system/state/wip/probe-dummy-task.md.tmp.50784.4e1d70fe6f66";
  const REAL = "workflow-system/state/.session.md";

  it("leaves state UNCHANGED when a temp-artifact write arrives", () => {
    const start = initialRecycleState();
    const after = recycleTransition(
      start,
      { kind: "session-md-write", mtimeMs: 99_999, path: TEMP },
      null,
    );
    expect(after).toEqual({ phase: "awaiting-fresh-write" });
  });

  it("⚠️ a temp write followed by Stop FAILS — the transient is not evidence", () => {
    // The defect the machine-level guard prevents: without it, the temp write (mtime 99_999,
    // trivially fresh) would advance to `awaiting-stop` and the next Stop would report SUCCESS
    // on a file that is about to be deleted — recycling away an unpreserved session.
    const state = drive(
      [
        { kind: "session-md-write", mtimeMs: 99_999, path: TEMP },
        { kind: "stop" },
      ],
      null,
    );
    expect(state).toEqual({ phase: "failed", reason: "no-fresh-write" });
  });

  it("a temp write does not disturb an already-observed fresh write", () => {
    // The realistic interleaving: the real pointer lands, then the Edit tool's temp churn for
    // the WIP file arrives before the Stop. The temp must not revise the retained evidence.
    const state = drive(
      [
        { kind: "session-md-write", mtimeMs: 28_328, path: REAL },
        { kind: "session-md-write", mtimeMs: 99_999, path: TEMP },
      ],
      null,
    );
    expect(state).toEqual({
      phase: "awaiting-stop",
      freshWriteMtimeMs: 28_328,
    });
  });

  it("a real write still advances the machine (the exclusion is not over-broad)", () => {
    // Anti-vacuity companion: a guard that rejected everything would pass the three tests above
    // while breaking the feature entirely.
    const state = drive(
      [
        { kind: "session-md-write", mtimeMs: 28_328, path: REAL },
        { kind: "stop" },
      ],
      null,
    );
    expect(state).toEqual({ phase: "succeeded" });
  });
});

describe("isTempArtifactPath — the Edit-tool temp+rename exclusion", () => {
  it("excludes the LITERAL form WP1 observed", () => {
    expect(
      isTempArtifactPath(
        "workflow-system/state/wip/probe-dummy-task.md.tmp.50784.4e1d70fe6f66",
      ),
    ).toBe(true);
  });

  it("does NOT exclude a real .session.md path", () => {
    expect(isTempArtifactPath("workflow-system/state/.session.md")).toBe(false);
  });

  it("⚠️ does NOT exclude a real path under a directory containing '.tmp.'", () => {
    // The false positive a naive `path.includes('.tmp.')` produces: Recycle would ignore the
    // very write it is waiting for, and every fixture with a tidy path would still pass.
    expect(
      isTempArtifactPath(
        "/Users/x/my.tmp.work/proj/workflow-system/state/.session.md",
      ),
    ).toBe(false);
  });

  it("excludes a temp artifact even when nested under such a directory", () => {
    expect(
      isTempArtifactPath(
        "/Users/x/my.tmp.work/proj/state/.session.md.tmp.123.abc",
      ),
    ).toBe(true);
  });

  it("handles a bare filename with no directory component", () => {
    expect(isTempArtifactPath(".session.md")).toBe(false);
    expect(isTempArtifactPath(".session.md.tmp.1.a")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeout + terminal-state behavior.
// ─────────────────────────────────────────────────────────────────────────────

describe("the timeout arm — a hung step must be visible, not silent", () => {
  it("fails with reason 'timeout' from the start state", () => {
    const state = drive([{ kind: "timeout" }], null);
    expect(state).toEqual({ phase: "failed", reason: "timeout" });
  });

  it("fails with reason 'timeout' while awaiting the Stop", () => {
    // The realistic hang: the pointer landed, then the skill wedged and no Stop ever came.
    // ⚠️ The reason must stay 'timeout', NOT 'no-fresh-write' — the write DID happen, and
    // conflating the two would send the operator looking for the wrong problem.
    const state = drive(
      [
        {
          kind: "session-md-write",
          mtimeMs: 39_669,
          path: "workflow-system/state/.session.md",
        },
        { kind: "timeout" },
      ],
      null,
    );
    expect(state).toEqual({ phase: "failed", reason: "timeout" });
  });
});

describe("terminal states absorb further signals", () => {
  const terminals: readonly RecycleState[] = [
    { phase: "succeeded" },
    { phase: "failed", reason: "no-fresh-write" },
    { phase: "failed", reason: "timeout" },
  ];
  const signals: readonly RecycleSignal[] = [
    { kind: "stop" },
    {
      kind: "session-md-write",
      mtimeMs: 1,
      path: "workflow-system/state/.session.md",
    },
    { kind: "timeout" },
  ];

  it("returns a terminal state unchanged for every signal", () => {
    // The two real sources are async and debounced, and the caller unsubscribes ON terminal —
    // which is inherently racy. A trailing signal must be inert, not a crash or a revision.
    for (const terminal of terminals) {
      for (const signal of signals) {
        expect(recycleTransition(terminal, signal, null)).toEqual(terminal);
      }
    }
  });

  it("isTerminal agrees with the phase set", () => {
    expect(isTerminal(initialRecycleState())).toBe(false);
    expect(isTerminal({ phase: "awaiting-stop", freshWriteMtimeMs: 1 })).toBe(
      false,
    );
    for (const terminal of terminals) expect(isTerminal(terminal)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Structural properties.
// ─────────────────────────────────────────────────────────────────────────────

describe("structural guarantees", () => {
  it("initialRecycleState returns a FRESH object each call (no shared mutable literal)", () => {
    expect(initialRecycleState()).not.toBe(initialRecycleState());
    expect(initialRecycleState()).toEqual({ phase: "awaiting-fresh-write" });
  });

  it("⚠️ the illegal state {sawFreshWrite:false, sawStop:true} is UNREPRESENTABLE", () => {
    // The design property, asserted as behavior rather than prose: there is no reachable state
    // in which a Stop was seen without a fresh write and the machine is still running. A flag-pair
    // implementation would have such a state and would rely on a rule to reject it.
    const afterEarlyStop = recycleTransition(
      initialRecycleState(),
      { kind: "stop" },
      null,
    );
    expect(afterEarlyStop.phase).toBe("failed");
    expect(isTerminal(afterEarlyStop)).toBe(true);
  });

  it("the transition function is deterministic and does not mutate its input", () => {
    const start = initialRecycleState();
    const frozen = Object.freeze({ ...start });
    const a = recycleTransition(
      frozen,
      {
        kind: "session-md-write",
        mtimeMs: 5,
        path: "workflow-system/state/.session.md",
      },
      null,
    );
    const b = recycleTransition(
      frozen,
      {
        kind: "session-md-write",
        mtimeMs: 5,
        path: "workflow-system/state/.session.md",
      },
      null,
    );
    expect(a).toEqual(b);
    expect(frozen).toEqual({ phase: "awaiting-fresh-write" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// verify-codify — the full transition matrix.
// ─────────────────────────────────────────────────────────────────────────────

describe("verify-codify: the complete state × signal matrix", () => {
  // ⚠️ WHY A MATRIX AND NOT MORE SCENARIOS. The 27 scenario tests above were written from the
  // three CAPTURED RUNS — real sequences a live CC produced. That is their strength (they encode
  // reality, not imagination) and also their blind spot: a cell the probe never happened to
  // exercise is a cell no test drives. Enumerating every non-terminal state against every signal
  // kind found one such cell, described below. Kept as a matrix so a future edit that changes one
  // branch's behavior fails HERE with the whole picture visible, rather than in a scenario test
  // whose name explains only one path.

  const REAL = "workflow-system/state/.session.md";
  const TEMP = "workflow-system/state/wip/x.md.tmp.50784.4e1d70fe6f66";
  const AFW = initialRecycleState();
  const AS: RecycleState = { phase: "awaiting-stop", freshWriteMtimeMs: 100 };

  it("⚠️ a STALE write in awaiting-stop must NOT overwrite the retained fresh evidence", () => {
    // THE GAP verify-codify found. This does not change the succeeded/failed verdict — the next
    // `Stop` succeeds either way — which is exactly why no behavioral test caught it. What it
    // corrupts is `freshWriteMtimeMs`, the field's whole reason for existing (diagnostics for the
    // operator on a failed recycle). Before the fix this returned `freshWriteMtimeMs: 5`: the
    // machine's two phases disagreed about what counts as evidence, with `awaiting-fresh-write`
    // rejecting the very write `awaiting-stop` accepted.
    const after = recycleTransition(
      AS,
      { kind: "session-md-write", mtimeMs: 5, path: REAL },
      50,
    );
    expect(after).toEqual({ phase: "awaiting-stop", freshWriteMtimeMs: 100 });
  });

  it("a FRESH write in awaiting-stop DOES advance the retained evidence", () => {
    // Anti-vacuity companion: a branch that rejected every write would satisfy the test above
    // while breaking the legitimate "skill rewrites the pointer before Stop" case.
    const after = recycleTransition(
      AS,
      { kind: "session-md-write", mtimeMs: 200, path: REAL },
      50,
    );
    expect(after).toEqual({ phase: "awaiting-stop", freshWriteMtimeMs: 200 });
  });

  it("pins every cell of the matrix", () => {
    // Both non-terminal phases × every signal shape. Any behavior change shows up here as a diff
    // against the whole table, so the reviewer sees which cells moved relative to their siblings.
    const cell = (
      s: RecycleState,
      sig: RecycleSignal,
      baseline: number | null,
    ) => recycleTransition(s, sig, baseline);

    expect({
      "awaiting-fresh-write + stop": cell(AFW, { kind: "stop" }, null),
      "awaiting-fresh-write + timeout": cell(AFW, { kind: "timeout" }, null),
      "awaiting-fresh-write + fresh write": cell(
        AFW,
        { kind: "session-md-write", mtimeMs: 100, path: REAL },
        null,
      ),
      "awaiting-fresh-write + stale write": cell(
        AFW,
        { kind: "session-md-write", mtimeMs: 5, path: REAL },
        50,
      ),
      "awaiting-fresh-write + temp write": cell(
        AFW,
        { kind: "session-md-write", mtimeMs: 100, path: TEMP },
        null,
      ),
      "awaiting-stop + stop": cell(AS, { kind: "stop" }, null),
      "awaiting-stop + timeout": cell(AS, { kind: "timeout" }, null),
      "awaiting-stop + fresh write": cell(
        AS,
        { kind: "session-md-write", mtimeMs: 200, path: REAL },
        50,
      ),
      "awaiting-stop + stale write": cell(
        AS,
        { kind: "session-md-write", mtimeMs: 5, path: REAL },
        50,
      ),
      "awaiting-stop + temp write": cell(
        AS,
        { kind: "session-md-write", mtimeMs: 200, path: TEMP },
        50,
      ),
    }).toEqual({
      "awaiting-fresh-write + stop": {
        phase: "failed",
        reason: "no-fresh-write",
      },
      "awaiting-fresh-write + timeout": { phase: "failed", reason: "timeout" },
      "awaiting-fresh-write + fresh write": {
        phase: "awaiting-stop",
        freshWriteMtimeMs: 100,
      },
      "awaiting-fresh-write + stale write": { phase: "awaiting-fresh-write" },
      "awaiting-fresh-write + temp write": { phase: "awaiting-fresh-write" },
      "awaiting-stop + stop": { phase: "succeeded" },
      "awaiting-stop + timeout": { phase: "failed", reason: "timeout" },
      "awaiting-stop + fresh write": {
        phase: "awaiting-stop",
        freshWriteMtimeMs: 200,
      },
      "awaiting-stop + stale write": {
        phase: "awaiting-stop",
        freshWriteMtimeMs: 100,
      },
      "awaiting-stop + temp write": {
        phase: "awaiting-stop",
        freshWriteMtimeMs: 100,
      },
    });
  });
});
