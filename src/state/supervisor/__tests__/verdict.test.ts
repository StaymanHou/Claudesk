// M15 WP3 Phase 3 — the verdict's contract.
//
// ⚠️ EVERY EDGE ID BELOW IS A REAL EDGE FROM THE ABSORBED GRAPH, chosen by enumerating
// `EDGES` and resolving each against the policy — not invented to fit the test. The
// classes they represent are the ones the WP1 probe measured, so a test that stops
// matching reality fails rather than drifting quietly.

import { describe, expect, it } from "vitest";
import {
  decideFromRaw,
  decideSupervised,
  decideVerdict,
  FireLedger,
  turnKeyOf,
  type TurnKey,
  type Verdict,
} from "../verdict";
import type { TranscriptLine } from "../transcript";
import { RECYCLE_TOKEN_THRESHOLD } from "../contextPressure";
import {
  atNonFinalPhaseBoundary,
  isFeatureWorkflow,
  parseWip,
} from "../wipPhases";
import { EDGES } from "../../workflowMachine/edges";
import { isDispatchable } from "../../workflowMachine/types";
import { DRIVE_MODES } from "../../workflowMachine/policy";

const assistantText = (text: string): TranscriptLine => ({
  type: "assistant",
  message: { role: "assistant", content: [{ type: "text", text }] },
});

const assistantSkill = (skill: string): TranscriptLine => ({
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "tool_use", name: "Skill", input: { skill } }],
  },
});

/** A turn that emitted `edgeId` and did NOT chain. */
const emitted = (edgeId: string): TranscriptLine[] => [
  assistantText(`Done.\n\nTRANSITION: ${edgeId}`),
];

const decide = (
  lines: TranscriptLine[],
  storedMode: Parameters<typeof decideVerdict>[0]["storedMode"] = "autopilot",
): Verdict => decideVerdict({ lines, storedMode });

describe("decideVerdict — the fire path", () => {
  it("fires on an AUTO + dispatchable edge, naming the skill to inject", () => {
    // F5 (spec → plan) is AUTO in autopilot and targets a real skill.
    const v = decide(emitted("F5"));
    expect(v.kind).toBe("fire");
    if (v.kind !== "fire") return;
    expect(v.edgeId).toBe("F5");
    expect(v.skill).toBe("feature-plan");
    expect(v.mode).toBe("autopilot");
  });

  it("reports the EFFECTIVE mode — incidents are forced to Mode 2 inside the funnel", () => {
    // ⚠️ I5 resolves AUTO even when the stored mode is `stepping`, because the funnel
    // applies the incident override. The verdict must report the mode that was APPLIED,
    // not the one requested — otherwise a diagnostic reads as a contradiction.
    const v = decide(emitted("I5"), "stepping");
    expect(v.kind).toBe("fire");
    if (v.kind !== "fire") return;
    expect(v.skill).toBe("incident-investigate");
    expect(v.mode).toBe("orchestrated");
  });
});

describe("decideVerdict — ⚠️ the negative arm, asserted as hard as the positive", () => {
  it("withholds on a PAUSE policy — a legitimate stop, not a break", () => {
    // F3 is PAUSE in autopilot. This is the case the supervisor must never fire on.
    const v = decide(emitted("F3"));
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("policy-not-auto");
  });

  it("⚠️ withholds on AUTO-but-NON-DISPATCHABLE — the 223-vs-127 class", () => {
    // THE CHECK THIS PHASE EXISTS FOR. F19 (finalize → EXIT→reflect) has a from-state row
    // that reads AUTO, but its target is TERMINAL — there is no skill to inject. Labelling
    // on the policy cell alone marked 223 breaks; reading `dispatchTarget` independently
    // took it to 127. A caller that fired on `cell.kind === "auto"` alone would inject a
    // command into a workflow that has already ended.
    const v = decide(emitted("F19"));
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("not-dispatchable");
    expect(v.detail).toContain("terminal");
  });

  it("⚠️ withholds on an ESCALATE / cross-workflow edge", () => {
    // T3 hands control to a DIFFERENT workflow. Firing would cross a workflow boundary
    // unattended — a blast radius nothing in M15 measured or sanctioned.
    const v = decide(emitted("T3"));
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("not-dispatchable");
  });

  it("⚠️ withholds on an UNMAPPED edge — never coerced to auto", () => {
    // I2 (report → triage) has NO governing policy row upstream and IS dispatchable — the
    // single most dangerous edge for an `?? "auto"` fallback. 31 edges are unmapped; a
    // default would fire on all of them.
    const v = decide(emitted("I2"));
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("unmapped");
  });

  it("withholds when the turn already chained", () => {
    const v = decide([
      assistantText("TRANSITION: F5"),
      assistantSkill("feature-plan"),
    ]);
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("already-chained");
    expect(v.detail).toContain("feature-plan");
  });

  it("withholds when no verdict was emitted — the common case, not a break", () => {
    const v = decide([assistantText("Just thinking out loud.")]);
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("no-verdict");
  });

  it("withholds on an edge that is not in the graph at all", () => {
    const v = decide(emitted("F999"));
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.reason).toBe("unknown-edge");
  });

  it("⚠️ withholds when the project has NO stored drive mode — supervision is opt-in", () => {
    // Defaulting to `orchestrated` here would silently supervise every project on the
    // machine, including ones whose picker row reads "Drive Mode: None".
    const v = decide(emitted("F5"), null);
    expect(v.kind).toBe("withhold");
    if (v.kind !== "withhold") return;
    expect(v.detail).toContain("opt-in");
  });
});

describe("decideVerdict — mode sensitivity", () => {
  it("⚠️ the SAME edge fires or withholds depending on the stored mode", () => {
    // The stored mode is the authority (R-1), so it must actually change the answer —
    // otherwise the policy graph is decorative. F5 is AUTO in autopilot, PAUSE in stepping.
    expect(decide(emitted("F5"), "autopilot").kind).toBe("fire");
    const stepping = decide(emitted("F5"), "stepping");
    expect(stepping.kind).toBe("withhold");
    if (stepping.kind !== "withhold") return;
    expect(stepping.reason).toBe("policy-not-auto");
  });
});

describe("decideFromRaw", () => {
  it("parses raw JSONL and decides in one step", () => {
    const raw = [
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "TRANSITION: F5" }] },
      }),
      "{ not json",
    ];
    const v = decideFromRaw(raw, "autopilot");
    expect(v.kind).toBe("fire");
    if (v.kind !== "fire") return;
    expect(v.skill).toBe("feature-plan");
  });
});

describe("⚠️ the no-fallback invariant, asserted structurally", () => {
  it("never returns `fire` for any edge whose target is not a skill", () => {
    // ⚠️ A property test over the WHOLE graph rather than the sampled ids above. Those prove
    // the known classes; this proves there is no SEVENTH class that slips through — including
    // any edge a future upstream sync adds. It is the structural form of the header's
    // "(2) and (3) are different questions" rule.
    let fired = 0;
    for (const mode of DRIVE_MODES) {
      for (const edge of EDGES) {
        const v = decideVerdict({ lines: emitted(edge.id), storedMode: mode });
        if (v.kind !== "fire") continue;
        fired++;
        expect(
          isDispatchable(edge.dispatchTarget),
          `fired on ${edge.id} in ${mode} whose target is "${edge.dispatchTarget.kind}"`,
        ).toBe(true);
        expect(v.skill.length).toBeGreaterThan(0);
      }
    }
    // ⚠️ The anti-vacuity control: if the sweep fired on NOTHING the loop above asserts
    // nothing, and a broken verdict that always withholds would pass silently.
    expect(fired, "the sweep must actually fire somewhere").toBeGreaterThan(0);
  });
});

describe("FireLedger — ⚠️ idempotency keyed on the TURN", () => {
  const key = (over: Partial<TurnKey> = {}): TurnKey => ({
    workspaceId: "ws-1",
    transcriptPath: "/t/a.jsonl",
    edgeId: "F8",
    verdictIndex: 10,
    ...over,
  });

  it("claims a turn once and refuses the second claim", () => {
    // ⚠️ The case this exists for: a fire is ASYNCHRONOUS. `injectCommand` returns when the
    // bytes are written, but the transcript shows no `Skill` call until CC runs one — so the
    // next turn-end read still says "AUTO, dispatchable, not chained" and would fire again.
    const l = new FireLedger();
    expect(l.claim(key())).toBe(true);
    expect(l.claim(key())).toBe(false);
    expect(l.has(key())).toBe(true);
  });

  it("⚠️ distinguishes the SAME edge emitted at different points in the turn stream", () => {
    // A feature runs `F8` once per phase, so the same edge id recurs many times. Keying on
    // the edge alone would fire for phase 1 and then SILENTLY NEVER AGAIN — a feature that
    // stops working after its first use, with no error.
    const l = new FireLedger();
    expect(l.claim(key({ verdictIndex: 10 }))).toBe(true);
    expect(l.claim(key({ verdictIndex: 42 }))).toBe(true);
    expect(l.size).toBe(2);
  });

  it("keys separately per workspace and per transcript file", () => {
    // Two workspaces in one tree share a project path; the transcript path + workspace id are
    // what keep their turns apart.
    const l = new FireLedger();
    expect(l.claim(key())).toBe(true);
    expect(l.claim(key({ workspaceId: "ws-2" }))).toBe(true);
    expect(l.claim(key({ transcriptPath: "/t/b.jsonl" }))).toBe(true);
    expect(l.size).toBe(3);
  });

  it("⚠️ cannot collide when a field CONTAINS the separator character", () => {
    // ⚠️ THIS TEST WAS WRONG ON ITS FIRST WRITING AND MUTATION TESTING CAUGHT IT.
    // The original version embedded a NUL in the INPUT — a character that never occurs in a
    // real workspace id or path — so it passed even with a `-` separator and proved nothing.
    //
    // The collision a naive separator actually permits uses only ORDINARY characters: a
    // workspace id containing the separator can absorb the next field's value. Paths contain
    // `-` and `/` constantly (this repo's own transcript dir is `-Users-stayman-...`), so
    // this is a realistic key, not a contrived one.
    const a = turnKeyOf(
      key({ workspaceId: "ws-1", transcriptPath: "a.jsonl" }),
    );
    const b = turnKeyOf(
      key({ workspaceId: "ws", transcriptPath: "1-a.jsonl" }),
    );
    expect(
      a,
      "two DIFFERENT turns must not render to the same key — a separator that can occur " +
        "inside a field lets one field absorb the next",
    ).not.toBe(b);
  });

  it("is bounded, evicting oldest-first", () => {
    // The process is long-lived; a workspace open for days must not grow this without limit.
    const l = new FireLedger(3);
    for (let i = 0; i < 5; i++) l.claim(key({ verdictIndex: i }));
    expect(l.size).toBe(3);
    expect(l.has(key({ verdictIndex: 0 }))).toBe(false);
    expect(l.has(key({ verdictIndex: 4 }))).toBe(true);
  });
});

describe("⚠️ decideSupervised — the HYBRID's ordering", () => {
  const tailDeps = (answer: string) => ({
    run: async () => answer,
    warn: () => {},
  });

  it("adjudicates a would-be fire and lets PROCEED through", async () => {
    const r = await decideSupervised(
      { lines: emitted("F5"), storedMode: "autopilot", tail: "Done." },
      tailDeps("PROCEED"),
    );
    expect(r.kind).toBe("fire");
  });

  it("⚠️ the adjudicator can VETO a fire", async () => {
    const r = await decideSupervised(
      {
        lines: emitted("F5"),
        storedMode: "autopilot",
        tail: "Which option do you want?",
      },
      tailDeps("AWAITING"),
    );
    expect(r.kind).toBe("withhold");
    if (r.kind !== "withhold") return;
    expect(r.reason).toBe("adjudicator-says-awaiting");
    expect(r.edgeId).toBe("F5");
  });

  it("⚠️ the adjudicator can NEVER PROMOTE a mechanical withhold", async () => {
    // THE ORDERING PROPERTY. An LLM that could turn a withhold into a fire would be exactly
    // the drift-prone judgment component this milestone exists to remove. F3 is PAUSE; even
    // an adjudicator screaming PROCEED must not move it.
    //
    // ⚠️ Mutation-proved 2026-09-13 against a REAL promotion bug (synthesizing a `fire` from
    // a withheld verdict). Note that merely deleting the early return does NOT promote —
    // the function still ends in `return mechanical` — so that weaker mutant is caught only
    // by the sibling "does not consult the adjudicator" test. Both are needed.
    const r = await decideSupervised(
      { lines: emitted("F3"), storedMode: "autopilot", tail: "anything" },
      tailDeps("PROCEED"),
    );
    expect(r.kind).toBe("withhold");
    if (r.kind !== "withhold") return;
    expect(r.reason).toBe("policy-not-auto");
  });

  it("⚠️ does not consult the adjudicator at all on a mechanical withhold", async () => {
    // Both a correctness property (no promotion path) and the reason the ~3s cost stays off
    // the vast majority of turns, which never fire.
    let calls = 0;
    await decideSupervised(
      { lines: emitted("F19"), storedMode: "autopilot", tail: "x" },
      {
        run: async () => {
          calls++;
          return "PROCEED";
        },
        warn: () => {},
      },
    );
    expect(calls).toBe(0);
  });

  it("⚠️ adjudicates EVERY fire candidate, not a selected edge class", async () => {
    // The narrow router sends 40 of 96 and misses 10 of 32 awaiting-turns. Drive several
    // unrelated firing edges and assert each one was adjudicated.
    const adjudicated: string[] = [];
    const d = {
      run: async ({ prompt }: { prompt: string }) => {
        adjudicated.push(prompt);
        return "PROCEED";
      },
      warn: () => {},
    };
    for (const edge of ["F5", "F6", "P3", "P5"]) {
      await decideSupervised(
        { lines: emitted(edge), storedMode: "autopilot", tail: `tail-${edge}` },
        d,
      );
    }
    expect(adjudicated).toHaveLength(4);
    for (const edge of ["F5", "F6", "P3", "P5"]) {
      expect(adjudicated.some((p) => p.includes(`tail-${edge}`))).toBe(true);
    }
  });

  it("withholds when the adjudicator fails — the failure direction, end to end", async () => {
    const r = await decideSupervised(
      { lines: emitted("F5"), storedMode: "autopilot", tail: "Done." },
      {
        run: async () => {
          throw new Error("claude not found on PATH");
        },
        warn: () => {},
      },
    );
    expect(r.kind).toBe("withhold");
    if (r.kind !== "withhold") return;
    expect(r.reason).toBe("adjudicator-says-awaiting");
    expect(r.detail).toContain("withheld-on-error");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M15 WP4 Phase 3 — THE RECYCLE BRANCH.
//
// ⚠️ The three conditions are tested INDIVIDUALLY FALSIFIED, not just jointly satisfied. A
// three-way `&&` passes a "all three true → recycle" test no matter which arms are actually
// wired, so each test below turns exactly ONE condition off and asserts the verdict falls back
// to `fire` — that is what proves each arm is load-bearing.
describe("⚠️ decideSupervised — the M15 WP4 recycle branch", () => {
  const tailDeps = (answer: string) => ({
    run: async () => answer,
    warn: () => {},
  });

  /** A feature WIP at a non-final boundary: one phase done, one open. */
  const featureAtBoundary = parseWip(
    [
      "**Workflow:** feature",
      "- [x] Phase 1: done",
      "- [ ] Phase 2: open",
    ].join("\n"),
  );

  /** The same shape, but every phase complete — the ship-bound case. */
  const featureAllDone = parseWip(
    [
      "**Workflow:** feature",
      "- [x] Phase 1: done",
      "- [x] Phase 2: done",
    ].join("\n"),
  );

  /** A task WIP — no phase structure, so the recycle must never apply. */
  const taskWip = parseWip("**Workflow:** task\n\n## Plan\n- [ ] do it");

  const OVER = RECYCLE_TOKEN_THRESHOLD + 1;
  const UNDER = RECYCLE_TOKEN_THRESHOLD - 1;

  const decide = (over: unknown) =>
    decideSupervised(
      {
        lines: emitted("F5"),
        storedMode: "autopilot",
        tail: "Done.",
        ...(over as object),
      },
      tailDeps("PROCEED"),
    );

  it("recycles when ALL THREE conditions hold", async () => {
    const r = await decide({
      contextTokens: OVER,
      wip: featureAtBoundary,
    });
    expect(r.kind).toBe("recycle");
    if (r.kind !== "recycle") return;
    // ⚠️ The deferred skill is carried, not dropped: an unattended recycle must be explainable.
    expect(r.skill).toBeTruthy();
    expect(r.edgeId).toBe("F5");
    expect(r.tokens).toBe(OVER);
  });

  it("⚠️ FIRES (does not recycle) when context is UNDER the threshold", async () => {
    // Condition 1 falsified, other two held.
    const r = await decide({ contextTokens: UNDER, wip: featureAtBoundary });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ FIRES when the context reading is NULL (unreadable)", async () => {
    // ⚠️ The destructive-branch rule: no evidence must never mean "end the session".
    const r = await decide({ contextTokens: null, wip: featureAtBoundary });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ FIRES when the workflow is NOT feature, even over threshold at a boundary", async () => {
    // Condition 2 falsified. Task/incident/product have no phase structure; auto-chain
    // enforcement still applies, which is why this FIRES rather than withholding.
    const r = await decide({ contextTokens: OVER, wip: taskWip });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ FIRES for a TASK WIP that DOES carry phase lines — the feature gate's real job", async () => {
    // ⚠️ **THIS TEST EXISTS BECAUSE A MUTANT SURVIVED WITHOUT IT.** Deleting `isFeatureWorkflow`
    // from `shouldRecycle` left all 34 tests green, because the `taskWip` fixture above has NO
    // phase lines — so `atNonFinalPhaseBoundary` already returned false and the feature gate
    // was never the thing doing the work.
    //
    // ⚠️ The discriminating input is a NON-feature WIP that nonetheless parses to a non-final
    // boundary: `boundary: true` + `isFeature: false`. Nothing in the schema prevents a task or
    // incident WIP from containing `Phase N:` lines, and the gate exists precisely so we do not
    // have to assume it never will.
    const taskWithPhases = parseWip(
      ["**Workflow:** task", "- [x] Phase 1: done", "- [ ] Phase 2: open"].join(
        "\n",
      ),
    );
    // Sanity: this fixture really does satisfy the OTHER two conditions.
    expect(atNonFinalPhaseBoundary(taskWithPhases)).toBe(true);
    expect(isFeatureWorkflow(taskWithPhases)).toBe(false);

    const r = await decide({ contextTokens: OVER, wip: taskWithPhases });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ FIRES at the LAST phase — a completed feature is not recycled", async () => {
    // Condition 3 falsified (no open phase). Recycling here would hand a fresh session a
    // feature with no work left; the next step is ship, not a new session.
    const r = await decide({ contextTokens: OVER, wip: featureAllDone });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ FIRES when no WIP evidence was supplied at all", async () => {
    // The opt-in property: a caller that supplies no `wip` keeps WP3's chain-only behavior.
    const r = await decide({ contextTokens: OVER });
    expect(r.kind).toBe("fire");
  });

  it("⚠️ every existing caller is unaffected — no evidence fields at all still FIRES", async () => {
    const r = await decide({});
    expect(r.kind).toBe("fire");
  });

  it("⚠️ a mechanical WITHHOLD is NEVER promoted to a recycle", async () => {
    // ⚠️ THE ORDERING PROPERTY, restated for the new branch. F3 is PAUSE in orchestrated mode;
    // every reason not to CHAIN is equally a reason not to END THE SESSION. A recycle that
    // could promote a withhold would be strictly worse than the fire it replaced.
    const r = await decideSupervised(
      {
        lines: emitted("F3"),
        storedMode: "orchestrated",
        tail: "Done.",
        contextTokens: OVER,
        wip: featureAtBoundary,
      },
      tailDeps("PROCEED"),
    );
    expect(r.kind).toBe("withhold");
  });

  it("⚠️ an ADJUDICATOR VETO beats the recycle — an awaiting turn is not recycled", async () => {
    // ⚠️ THE MOST DAMAGING ORDERING MISTAKE AVAILABLE HERE. If the recycle branch ran BEFORE the
    // adjudicator, a turn that had asked the operator a question would be recycled — destroying
    // the very question it was waiting on. Withhold must win.
    const r = await decideSupervised(
      {
        lines: emitted("F5"),
        storedMode: "autopilot",
        tail: "Which option do you want?",
        contextTokens: OVER,
        wip: featureAtBoundary,
      },
      tailDeps("AWAITING"),
    );
    expect(r.kind).toBe("withhold");
    if (r.kind !== "withhold") return;
    expect(r.reason).toBe("adjudicator-says-awaiting");
  });

  it("does not recycle at exactly the threshold (strictly greater)", async () => {
    const r = await decide({
      contextTokens: RECYCLE_TOKEN_THRESHOLD,
      wip: featureAtBoundary,
    });
    expect(r.kind).toBe("fire");
  });
});
