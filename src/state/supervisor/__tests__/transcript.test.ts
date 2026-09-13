// M15 WP3 Phase 2 — the transcript parse's contract.
//
// ⚠️ The two traps this module exists for are both SILENT when got wrong (a token read off a
// doc line looks like a verdict; an early-closed window looks like a break), so the tests
// that matter are the ones that would pass on a naive implementation only by luck. Each is
// labelled with the measurement it encodes.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isUserProseTurn,
  parseTranscript,
  readTurn,
  skillInvocation,
  type TranscriptLine,
} from "../transcript";

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

const assistantBash = (): TranscriptLine => ({
  type: "assistant",
  message: {
    role: "assistant",
    content: [{ type: "tool_use", name: "Bash", input: {} }],
  },
});

const toolResult = (): TranscriptLine => ({
  type: "user",
  toolUseResult: { stdout: "ok" },
  message: { role: "user", content: [{ type: "tool_result" }] },
});

const userProse = (text: string): TranscriptLine => ({
  type: "user",
  message: { role: "user", content: text },
});

describe("parseTranscript", () => {
  it("skips unparseable lines instead of failing the whole read", () => {
    // The Rust side reads a byte-bounded tail with lossy UTF-8; one mangled record must not
    // blank the read.
    const out = parseTranscript([
      '{"type":"assistant"}',
      "{not json",
      "",
      '{"type":"user"}',
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("isUserProseTurn — trap 2's discriminator", () => {
  it("⚠️ does NOT treat a tool result as a user turn", () => {
    // MEASURED: 175 tool-result vs 12 prose user-lines in one live session. Keying on
    // `type === "user"` alone closes the chain window on the agent's own tool calls, which
    // over-flagged 31 turns as breaks in the probe corpus (127 → 96 when fixed).
    expect(isUserProseTurn(toolResult())).toBe(false);
  });

  // ⚠️ THE NEXT TWO TESTS EXIST BECAUSE MUTATION TESTING FOUND THE FIRST ONE INSUFFICIENT.
  //
  // A real tool result carries BOTH the `toolUseResult` key AND a `tool_result` content
  // block, so `toolResult()` above is rejected twice over. Deleting EITHER check individually
  // left the whole suite green (verified 2026-09-13): the two arms mask each other, and a
  // guard that cannot be made to fail is not guarding. These isolate one arm each, so each
  // check now has a test that dies without it.

  it("⚠️ rejects a tool result identified ONLY by its toolUseResult key", () => {
    // Content shaped like prose; only the key marks it. Kills the `toolUseResult` arm.
    expect(
      isUserProseTurn({
        type: "user",
        toolUseResult: { stdout: "ok" },
        message: { role: "user", content: "some output text" },
      }),
    ).toBe(false);
  });

  it("⚠️ rejects a tool result identified ONLY by its tool_result block", () => {
    // No `toolUseResult` key at all — only the content block marks it. Kills that arm.
    expect(
      isUserProseTurn({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "text", text: "here is the result" },
            { type: "tool_result", content: "ok" },
          ],
        },
      }),
    ).toBe(false);
  });

  it("treats real prose as a user turn, string or block form", () => {
    expect(isUserProseTurn(userProse("do the thing"))).toBe(true);
    expect(
      isUserProseTurn({
        type: "user",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
    ).toBe(true);
  });

  it("ignores harness bookkeeping and system lines", () => {
    // Real types observed in a live transcript alongside user/assistant.
    for (const type of [
      "system",
      "attachment",
      "queue-operation",
      "mode",
      "permission-mode",
      "atis-latch",
      "last-prompt",
    ]) {
      expect(isUserProseTurn({ type, message: { content: "x" } })).toBe(false);
    }
  });

  it("does not count an empty user message as prose", () => {
    expect(isUserProseTurn(userProse("   "))).toBe(false);
  });
});

describe("skillInvocation", () => {
  it("finds a Skill tool_use and returns the skill name", () => {
    expect(skillInvocation(assistantSkill("feature-build"))).toBe(
      "feature-build",
    );
  });

  it("returns null for a non-Skill tool call", () => {
    expect(skillInvocation(assistantBash())).toBeNull();
  });
});

describe("readTurn — trap 1: the token must come off an ASSISTANT block", () => {
  it("⚠️ ignores a TRANSITION token on a USER line", () => {
    // MEASURED: 559 user-role vs 555 assistant-role occurrences across a 40-file sample —
    // skill bodies carry the whole transitions table and tool results echo docs. A
    // file-level grep reads DOCUMENTATION as emitted verdicts.
    const lines = [
      userProse("the table says TRANSITION: F10 means verify-self"),
      assistantText("Working on it."),
    ];
    expect(readTurn(lines).edgeId).toBeNull();
  });

  it("⚠️ ignores a TRANSITION token inside a tool result", () => {
    const lines = [
      {
        ...toolResult(),
        message: {
          role: "user",
          content: [{ type: "tool_result", content: "TRANSITION: F8" }],
        },
      } as TranscriptLine,
      assistantText("done"),
    ];
    expect(readTurn(lines).edgeId).toBeNull();
  });

  it("reads the token off the last assistant block that carries one", () => {
    const lines = [
      assistantText("TRANSITION: F7"),
      assistantText("TRANSITION: F8"),
    ];
    expect(readTurn(lines).edgeId).toBe("F8");
  });

  it("⚠️ takes the LAST token in a block that also quotes the table", () => {
    // An agent that narrates the policy before emitting its own verdict would otherwise
    // yield the QUOTED id — a wrong edge, which resolves to a wrong policy row.
    const lines = [
      assistantText(
        "The table lists TRANSITION: F9 as the back-loop.\n\nTRANSITION: F8",
      ),
    ];
    expect(readTurn(lines).edgeId).toBe("F8");
  });

  it("⚠️ does not truncate a letter-suffixed id", () => {
    // A bare /F[0-9]+/ captures F10 from F10b — the WRONG id rather than no match, which is
    // why `extractTransitionId` is imported rather than re-derived.
    expect(readTurn([assistantText("TRANSITION: F10b")]).edgeId).toBe("F10b");
    expect(readTurn([assistantText("**TRANSITION:** F17b")]).edgeId).toBe(
      "F17b",
    );
  });
});

describe("readTurn — trap 2: the chain window must not close early", () => {
  it("⚠️ still sees the chain after intervening tool calls (the 06eb0e92 case)", () => {
    // THE PROVEN FALSE POSITIVE. Session 06eb0e92 turn 504 emitted F10 and DID chain — the
    // Skill call landed at line 511, after two Bash calls and narration. An early-closing
    // window labelled it a break.
    const lines = [
      assistantText("TRANSITION: F10"),
      assistantBash(),
      toolResult(),
      assistantBash(),
      toolResult(),
      assistantText("Chaining to verify-self."),
      assistantSkill("feature-verify-self"),
    ];
    const r = readTurn(lines);
    expect(r.alreadyChained).toBe(true);
    expect(r.chainedTo).toBe("feature-verify-self");
  });

  it("⚠️ survives narration that RE-QUOTES the transition token", () => {
    // The re-quote is what makes a token-based window close early.
    const lines = [
      assistantText("TRANSITION: F10"),
      assistantText(
        "As noted, TRANSITION: F10 is AUTO in autopilot, so chaining now.",
      ),
      assistantSkill("feature-verify-self"),
    ];
    expect(readTurn(lines).alreadyChained).toBe(true);
  });

  it("⚠️ detects a chain emitted in the SAME assistant message as the verdict", () => {
    // The forward scan starts AT the verdict line, not after it: a correctly-chaining agent
    // often puts the text block and the Skill tool_use in one message. Starting at +1 would
    // label every same-message chain a break.
    const lines: TranscriptLine[] = [
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "TRANSITION: F8" },
            {
              type: "tool_use",
              name: "Skill",
              input: { skill: "feature-verify-auto" },
            },
          ],
        },
      },
    ];
    const r = readTurn(lines);
    expect(r.alreadyChained).toBe(true);
    expect(r.chainedTo).toBe("feature-verify-auto");
  });

  it("closes the window on a real user prose turn — THIS is a break", () => {
    // The positive case for the detector: verdict emitted, operator spoke, no Skill call.
    const lines = [
      assistantText("TRANSITION: F8"),
      assistantText("Ready to run verify-auto."),
      userProse("actually hold on"),
      assistantSkill("feature-verify-auto"),
    ];
    const r = readTurn(lines);
    expect(r.alreadyChained).toBe(false);
    expect(r.chainedTo).toBeNull();
    expect(r.edgeId).toBe("F8");
  });

  it("reports no verdict when the transcript has none", () => {
    const r = readTurn([assistantText("just chatting"), userProse("ok")]);
    expect(r.edgeId).toBeNull();
    expect(r.alreadyChained).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M15 WP3 Phase 2 verify-codify — THE REAL-SHAPE TEST.
//
// ⚠️ WHY A COMMITTED FIXTURE AND NOT MORE HAND-BUILT OBJECTS. Every test above builds its
// own transcript lines, so all of them share one blind spot: they can only encode the shape I
// BELIEVE Claude Code writes. If that belief is wrong, they all pass and the reader is broken
// in production — the `[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`
// failure in its fixture form.
//
// This fixture is captured from a REAL transcript of this project (prose redacted; every
// `TRANSITION:` token, every `type`, and the whole message/content structure preserved
// verbatim). It was the artifact that confirmed the live verify-self reading, and it carries
// two properties no synthetic fixture above happens to have together:
//
//   • line 0 is a genuine `user` + `toolUseResult` line that ITSELF contains a `TRANSITION:`
//     token — trap 1's real-world shape, the thing a file-level grep misreads as a verdict;
//   • lines 1-2 are a real emitted verdict followed by a real `Skill` call — a true chain.
//
// ⚠️ If Claude Code's transcript format ever changes shape, THIS is the test that fails.
describe("readTurn — against a REAL captured transcript", () => {
  const realLines = (): string[] =>
    readFileSync(
      new URL("./fixtures/real-chained-turn.jsonl", import.meta.url),
      "utf8",
    )
      .split("\n")
      .filter((l) => l.trim());

  it("parses every line of a real transcript without dropping any", () => {
    // A silent parse failure would make every assertion below vacuous over a shorter array.
    const raw = realLines();
    expect(raw.length).toBeGreaterThan(0);
    expect(parseTranscript(raw)).toHaveLength(raw.length);
  });

  it("reads the real verdict and its real chain off a real transcript", () => {
    // ⚠️ HONEST SCOPE — this test does NOT kill the assistant-only-scoping mutant.
    // Mutation-tested 2026-09-13: replacing `assistantText(lines[i])` with
    // `JSON.stringify(lines[i])` leaves this test GREEN. The reason is specific and worth
    // recording, because it looks like the fixture is exercising trap 1 when it is not:
    // in the serialized user line the LAST `TRANSITION:` occurrence is not the decoy token
    // but a later escaped copy with no valid id after it, so `extractTransitionId` returns
    // null for that line and the backward scan falls through to the real verdict anyway.
    //
    // Trap 1 IS killed — by the two synthetic tests above, which both fail under that mutant.
    // What THIS test uniquely covers is the thing no hand-built object can: that the parser
    // reads a genuine Claude Code transcript — real `type` values, real message/content
    // nesting, a real `toolUseResult` line, a real `Skill` tool_use — and produces the
    // reading that was confirmed live at verify-self. If the transcript FORMAT changes, this
    // is the test that fails.
    const parsed = parseTranscript(realLines());
    const r = readTurn(parsed);

    expect(r.edgeId).toBe("F7");
    expect(r.alreadyChained).toBe(true);
    expect(r.chainedTo).toBe("feature-build");
    // The verdict came off an assistant line, and the fixture really does contain a
    // non-assistant line carrying the token text.
    expect(parsed[r.verdictIndex!].type).toBe("assistant");
    expect(
      parsed.some(
        (l) =>
          l.type !== "assistant" && JSON.stringify(l).includes("TRANSITION:"),
      ),
      "fixture must contain a non-assistant line bearing the token, or it is not a " +
        "realistic sample",
    ).toBe(true);
  });

  it("classifies the real line types correctly", () => {
    const parsed = parseTranscript(realLines());
    // The real tool_result line must NOT read as prose — if it did, the chain window would
    // close on it and this real, correctly-chained turn would be labelled a break.
    expect(parsed.filter(isUserProseTurn)).toHaveLength(0);
  });
});
