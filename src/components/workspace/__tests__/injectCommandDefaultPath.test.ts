import { describe, expect, it, vi, beforeEach } from "vitest";

// ⚠️ Mock the TAURI boundary only. The whole point of this file is to drive the REAL
// `injectCommand` — mocking it, the way `recycleSession.test.ts` deliberately does, is exactly
// the coverage hole this file exists to close.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { injectCommand, slashCommandPayload } =
  await import("../autoResumeFire");

// F-a WP4 Phase 1 verify-codify — the DEFAULT-PATH byte pin for `injectCommand`'s existing
// consumers.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ WHY THIS FILE EXISTS, AND WHY THE EXISTING SUITES DID NOT ALREADY COVER IT.
//
// WP4 Phase 1 widened `injectCommand` with an optional 5th `buildPayload` parameter. The safety
// claim for that widening is: "every existing caller omits it, so M12 / M13 / M15 / recycle are
// byte-identical." Auditing the suites at codify time showed that claim was only PARTLY pinned:
//
//   • M13 skill row  — `skillButtons.test.ts` DOES assert `data: slashCommandPayload(command)`
//                      across the real funnel. Genuinely covered.
//   • M15 supervisor — `fanOut.test.ts` passes `inject` as an injected DEPENDENCY, so it never
//                      reaches `injectCommand` at all. Covered at its own seam, not this one.
//   • recycle        — `recycleSession.test.ts` mocks `../autoResumeFire` WHOLESALE, so the real
//                      funnel is never exercised there.
//   • M12 auto-resume— `autoResumeFire.test.ts` pins the HELPER `slashCommandPayload` in
//                      isolation, and `injectOnceOnRelaunch.test.ts` is a `?raw` SOURCE-TEXT
//                      guard matching `/void injectCommand\(sessionId,\s*command\)/`.
//
// ⚠️ A helper-only pin cannot see a funnel that stopped CALLING the helper, and a source grep
// cannot see what actually crosses `invoke` (`[[raw-guard-substring-must-be-unique-to-its-site]]`).
// So the property "the default path still emits M12's exact bytes" had no end-to-end assertion.
//
// ⚠️ THIS MATTERS MORE THAN USUAL HERE: Phase 1's verify-human was CLOSED BY OPERATOR SKIP with
// all three of its leaves UNRUN (2026-09-22) — and those leaves were precisely the byte pins for
// these consumers. This file is the codified replacement for the check a human did not perform.
// It is not a duplicate of `stagedPayload.test.ts`'s pin: that one asserts the BUILDER in
// isolation; this one asserts what the FUNNEL sends when no builder is supplied.
//
// ⚠️ The expected bytes below are written as LITERAL byte arrays, NOT as
// `bytes(slashCommandPayload(cmd))`. Deriving the expectation from the code under test makes the
// assertion an arithmetic identity that holds no matter how wrong the code is
// (`[[detector-scored-against-its-own-table-is-circular]]`). One test below deliberately DOES
// compare against the helper — as a drift check between the two, which is a different question.

/** Decode what crossed the `invoke` boundary into raw bytes. */
function sentBytes(): number[] {
  const call = invokeMock.mock.calls.at(-1);
  if (!call) throw new Error("invoke was never called");
  const { data } = call[1] as { data: string };
  return [...Uint8Array.from(atob(data), (c) => c.charCodeAt(0))];
}

/** ASCII → byte array, for writing an expectation without reaching for the code under test. */
function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("M12 auto-resume — the default path's exact bytes", () => {
  // The command `XtermPane.tsx` injects, via `void injectCommand(sessionId, command)` — two
  // arguments, so BOTH `label` and `buildPayload` take their defaults. That two-argument shape is
  // the one the widening could most easily have broken.

  it("/session-restore crosses invoke as its literal bytes, ending in exactly one CR", async () => {
    await injectCommand("sess-m12", "/session-restore");

    // Literal expectation — `/session-restore` + 0x0d. Not derived from the code under test.
    expect(sentBytes()).toEqual([...ascii("/session-restore"), 0x0d]);
  });

  it("reaches cc_input with the session id it was given", async () => {
    await injectCommand("sess-m12", "/session-restore");
    const [command, args] = invokeMock.mock.calls[0] as [
      string,
      { sessionId: string; data: string },
    ];
    expect(command).toBe("cc_input");
    expect(args.sessionId).toBe("sess-m12");
  });

  it("gains NO bracketed-paste envelope", async () => {
    // ⚠️ The specific regression the widening could introduce: if the default ever became the
    // staged builder, M12 would start wrapping its slash command in `ESC[200~`…`ESC[201~` and CC
    // would receive it as pasted text rather than as a submitted command. 0x1b is ESC.
    await injectCommand("sess-m12", "/session-restore");
    expect(sentBytes()).not.toContain(0x1b);
  });

  it("ends in CR (0x0d), never LF (0x0a)", async () => {
    // In raw mode CR IS Enter; LF only triggers autocomplete typeahead and does not submit
    // (`[[raw-mode-cr-is-enter]]`, `[[cc-tui-cr-not-lf]]`).
    await injectCommand("sess-m12", "/session-restore");
    const sent = sentBytes();
    expect(sent.at(-1)).toBe(0x0d);
    expect(sent).not.toContain(0x0a);
  });
});

describe("recycle — the default path, at the arity its call sites actually use", () => {
  // ⚠️ `recycleSession.test.ts` mocks `../autoResumeFire` wholesale, so the real funnel is never
  // driven there. These two call sites pass FOUR arguments (a `"recycle"` label, no builder),
  // which is a different arity from M12's two — and arity is exactly what the widening changed.

  it("the handoff command crosses invoke as literal bytes", async () => {
    await injectCommand("sess-r", "/session-handoff", undefined, "recycle");
    expect(sentBytes()).toEqual([...ascii("/session-handoff"), 0x0d]);
  });

  it("the restore command crosses invoke as literal bytes", async () => {
    await injectCommand("sess-r", "/session-restore", undefined, "recycle");
    expect(sentBytes()).toEqual([...ascii("/session-restore"), 0x0d]);
  });

  it("passing a label does NOT change the bytes", async () => {
    // The 4th argument is diagnostic-only. If supplying it ever altered the payload, recycle and
    // auto-resume would silently diverge.
    await injectCommand("sess-r", "/session-restore", undefined, "recycle");
    const labelled = sentBytes();
    invokeMock.mockClear();
    await injectCommand("sess-r", "/session-restore");
    expect(labelled).toEqual(sentBytes());
  });
});

describe("M15 supervisor — the arity its wiring site forwards", () => {
  // ⚠️ `fanOut` takes `inject` as an injected dependency and is tested at THAT seam, so the real
  // funnel is unexercised there by design. What is NOT covered anywhere else is the wiring site's
  // own forwarding shape: `injectCommand(pty, command, undefined, label)` — four arguments, a
  // non-default label, no builder. Pinned here so the supervisor's bytes are not taken on trust.

  it("a supervisor-labelled injection still emits plain slash-command bytes", async () => {
    await injectCommand(
      "sess-s",
      "/feature-verify-auto",
      undefined,
      "supervisor",
    );
    expect(sentBytes()).toEqual([...ascii("/feature-verify-auto"), 0x0d]);
    expect(sentBytes()).not.toContain(0x1b);
  });
});

describe("the default parameter IS slashCommandPayload — drift check", () => {
  it("omitting the builder equals calling the helper directly", async () => {
    // ⚠️ Deliberately derived from the code under test, unlike every assertion above. This asks a
    // DIFFERENT question: not "are the bytes right" (the literals answer that) but "are the two
    // still the same function". If someone changes `slashCommandPayload` itself, the literal
    // assertions above fail and this one keeps passing — and that contrast is the diagnostic.
    for (const cmd of [
      "/session-restore",
      "/session-start",
      "/util-grill-me",
    ]) {
      invokeMock.mockClear();
      await injectCommand("s", cmd);
      const [, args] = invokeMock.mock.calls[0] as [string, { data: string }];
      expect(args.data, cmd).toBe(slashCommandPayload(cmd));
    }
  });

  it("a trailing newline still collapses to exactly one CR", async () => {
    // `slash_command_bytes`'s Rust twin trims trailing CR/LF then pushes one `\r`. Pinned through
    // the funnel because the trim lives in the helper the default parameter points at.
    for (const variant of [
      "/session-restore",
      "/session-restore\n",
      "/session-restore\r",
      "/session-restore\r\n",
      "/session-restore\n\n",
    ]) {
      invokeMock.mockClear();
      await injectCommand("s", variant);
      expect(sentBytes(), JSON.stringify(variant)).toEqual([
        ...ascii("/session-restore"),
        0x0d,
      ]);
    }
  });
});
