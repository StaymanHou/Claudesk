// ⚠️ SILENT-SUPERVISOR REPRODUCTION (SURFACE-2026-09-14-SUPERVISOR-NEVER-OBSERVED-FIRING-IN-A-LIVE-
// SESSION, cause 1): THE TRANSCRIPT READ RACES THE `Stop` HOOK.
//
// The supervisor reads the transcript tail as soon as `Stop` arrives, and CC has not always
// flushed the turn's final assistant line by then. Observed live 2026-09-25: a turn ending on
// `TRANSITION: F5` was recorded `no-verdict`; the same file re-read afterwards gives `F5`, and the
// file minus its final line gives nothing. The stub below plays that sequence: the first read is
// missing the final line, and later reads have it.
//
// Fake timers, so a fix that waits before re-reading is exercised without real delay, and a fix
// that re-reads immediately passes too.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireOne, type FanOutDeps, type SupervisedWorkspace } from "../fanOut";
import { FireLedger } from "../verdict";
import type { TranscriptTail } from "../transcript";

const PATH = "/t/race.jsonl";

const user = (text: string) =>
  JSON.stringify({ type: "user", message: { role: "user", content: text } });

// The two `stop_reason` shapes measured at research: a line that ENDS the turn carries
// `end_turn`; a line the model continues past (including a verdict that chains) carries
// `tool_use`. The fixtures carry them because the completion check reads them.
const assistantText = (text: string) =>
  JSON.stringify({
    type: "assistant",
    message: { stop_reason: "end_turn", content: [{ type: "text", text }] },
  });

/** An assistant message that emits a verdict AND chains in the same message. */
const assistantChains = (edge: string, skill: string) =>
  JSON.stringify({
    type: "assistant",
    message: {
      stop_reason: "tool_use",
      content: [
        { type: "text", text: `Done.\n\nTRANSITION: ${edge}` },
        { type: "tool_use", name: "Skill", input: { skill } },
      ],
    },
  });

const ws: SupervisedWorkspace = {
  workspaceId: "ws-1",
  sessionId: "sess-1",
  projectPath: "/p",
  storedMode: "autopilot",
  ptySessionId: "pty-1",
};

/** A `readTail` that returns `stale` on the first call and `fresh` on every later one. */
function laggingFlush(stale: string[], fresh: string[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    read: async (): Promise<TranscriptTail> => {
      calls += 1;
      return { path: PATH, lines: calls === 1 ? stale : fresh };
    },
  };
}

function deps(
  readTail: FanOutDeps["readTail"],
  ledger: FireLedger = new FireLedger(),
) {
  const injected: string[] = [];
  const d: FanOutDeps = {
    readTail,
    inject: async (_pty, command) => {
      injected.push(command);
    },
    adjudicator: { run: async () => "PROCEED", warn: () => {} },
    ledger,
    warn: () => {},
  };
  return { d, injected };
}

async function settle<T>(p: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return p;
}

describe("fireOne — the transcript's final line lands after `Stop`", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("still fires when the only verdict line is not yet flushed (was: no-verdict)", async () => {
    const prompt = user("/feature-build");
    const final = assistantText("Phase 1 built.\n\nTRANSITION: F8");
    const tail = laggingFlush([prompt], [prompt, final]);
    const { d, injected } = deps(tail.read);

    const r = await settle(fireOne(ws, d));

    expect(r.reason).toBeUndefined();
    expect(r.fired).toBe(true);
    expect(injected).toEqual(["/feature-verify-auto"]);
  });

  // ⚠️ The common real shape: an autopilot turn chains several skills and BREAKS on its last one.
  // A stale read then finds the previous skill's verdict, which DID chain, and withholds on it.
  // Beyond losing this fire, it claims the ledger with a key for the wrong verdict.
  it("still fires when a stale read would see an EARLIER, already-chained verdict", async () => {
    const prompt = user("/session-start build the thing");
    const earlier = assistantChains("F33", "feature-plan");
    const final = assistantText("Phase 1 built.\n\nTRANSITION: F8");
    const tail = laggingFlush([prompt, earlier], [prompt, earlier, final]);
    const { d, injected } = deps(tail.read);

    const r = await settle(fireOne(ws, d));

    expect(r.edgeId).toBe("F8");
    expect(r.fired).toBe(true);
    expect(injected).toEqual(["/feature-verify-auto"]);
  });

  // The anti-vacuity half: a turn that genuinely emitted no verdict must still end `no-verdict`
  // (a fix may re-read, but it must give up), and it must never inject.
  it("a turn with no verdict at all still withholds `no-verdict`, and stops re-reading", async () => {
    const prompt = user("hello");
    const reply = assistantText("Hi, what would you like to do?");
    const tail = laggingFlush([prompt], [prompt, reply]);
    const { d, injected } = deps(tail.read);

    const r = await settle(fireOne(ws, d));

    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no-verdict");
    expect(injected).toEqual([]);
    expect(tail.calls).toBeLessThan(10);
  });

  it("gives up after the budget with `transcript-incomplete`, claiming nothing", async () => {
    const prompt = user("/feature-build");
    const earlier = assistantChains("F33", "feature-plan");
    const final = assistantText("Built.\n\nTRANSITION: F8");
    let calls = 0;
    const neverCloses = async (): Promise<TranscriptTail> => {
      calls += 1;
      return { path: PATH, lines: [prompt, earlier] };
    };
    const ledger = new FireLedger();
    const { d, injected } = deps(neverCloses, ledger);

    const r = await settle(
      fireOne(ws, { ...d, completion: { attempts: 5, intervalMs: 100 } }),
    );

    expect(r.fired).toBe(false);
    expect(r.reason).toBe("transcript-incomplete");
    expect(calls).toBe(5);
    expect(injected).toEqual([]);
    // Nothing was claimed from the stale read: once the turn closes, it still fires.
    const late = await settle(
      fireOne(ws, {
        ...deps(
          async () => ({ path: PATH, lines: [prompt, earlier, final] }),
          ledger,
        ).d,
      }),
    );
    expect(late.fired).toBe(true);
    expect(late.command).toBe("/feature-verify-auto");
  });
});

// ⚠️ AC-3b — ONLY THE CURRENT TURN'S VERDICT COUNTS. Found at research: unscoped, the backward
// scan reached a verdict from before the operator's latest message and fired it.
describe("fireOne — a verdict from before the latest prompt never fires", () => {
  it("an AUTO verdict the operator has since replied to (was: fired /feature-verify-auto)", async () => {
    const lines = [
      assistantText("Built.\n\nTRANSITION: F8"),
      user("wait, what does F8 mean?"),
      assistantText("F8 is the edge from build to verify-auto."),
    ];
    const { d, injected } = deps(async () => ({ path: PATH, lines }));

    const r = await fireOne(ws, d);

    expect(r.fired).toBe(false);
    expect(r.reason).toBe("no-verdict");
    expect(injected).toEqual([]);
  });

  it("a resumed (`--continue`) transcript whose last verdict predates the new prompt", async () => {
    const lines = [
      user("/feature-plan"),
      assistantText("Planned.\n\nTRANSITION: F7"),
      user("Reply with only the word ok."),
      assistantText("ok"),
      JSON.stringify({ type: "system", subtype: "turn_duration" }),
    ];
    const { d, injected } = deps(async () => ({ path: PATH, lines }));

    const r = await fireOne(ws, d);

    expect(r.reason).toBe("no-verdict");
    expect(injected).toEqual([]);
  });
});
