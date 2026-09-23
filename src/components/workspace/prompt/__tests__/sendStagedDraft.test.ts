import { describe, expect, it, vi, beforeEach } from "vitest";

// ⚠️ Mock the TAURI boundary, not our own funnel. Mocking `injectCommand` would make these
// assertions about a test double rather than about the shipped path — the replica trap
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). Stubbing `invoke`
// drives the REAL `planSend` → REAL `injectCommand` → the IPC edge, so the widened
// `buildPayload` parameter and the `.catch` are exercised rather than replaced. This is the
// shape `skillButtons.test.ts` established for this same funnel.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { planSend, STAGING_INJECT_LABEL } = await import("../sendStagedDraft");
const { injectCommand, slashCommandPayload } =
  await import("../../autoResumeFire");
const { PASTE_START, PASTE_END, DICTATED_OPEN, DICTATED_CLOSE } =
  await import("../../stagedPayload");

// Paydown WP10: the pre-existing cases pin the UNWRAPPED envelope, so they pass the wrap OFF.
// The wrap's own cases are in the `dictated` block at the bottom.
const OFF = { dictated: false } as const;

// F-a WP4 Phase 1 — the send seam.
//
// ⚠️ THE RISK THIS FILE EXISTS TO CLOSE, and it is a named one:
// `[[ts-arity-flexible-assignability-hides-a-widened-param]]` — widening a function's parameter
// list breaks NO implementation and `tsc` stays green whether or not the new argument is ever
// passed. So "the tests are green" is not evidence that `buildPayload` reaches the funnel, that
// the label is `"staging"`, or that the two modes differ by the one byte they are supposed to.
// Every assertion below therefore captures the VALUE that crossed the boundary and decodes it,
// rather than counting calls.

/** Decode what `invoke` received back to the literal bytes CC would see. */
function sentText(): string {
  const call = invokeMock.mock.calls.at(-1);
  if (!call) throw new Error("invoke was never called");
  const { data } = call[1] as { data: string };
  // Inverse of `encodeBase64`: base64 → binary string → UTF-8 bytes → text.
  const binary = atob(data);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
});

describe("planSend — the blank check, which is load-bearing", () => {
  it("refuses an empty body", () => {
    expect(planSend("", "auto-submit", OFF)).toBeNull();
  });

  it("refuses a whitespace-only body, in either mode", () => {
    // ⚠️ NOT tidiness. `appendToHistory` REFUSES a blank entry, so a blank send would clear the
    // draft and archive NOTHING — quietly destroying the buffer. Refusing the send is the only
    // behaviour under which clear-and-archive stays consistent.
    for (const mode of ["auto-submit", "stage-only"] as const) {
      expect(
        planSend("   \n\t  ", mode, OFF),
        `${mode} accepted a blank body`,
      ).toBeNull();
    }
  });

  it("sends a body that is only MEANINGFULLY blank-adjacent", () => {
    // A single character surrounded by whitespace is real text. The blank test trims; the body
    // does not.
    const plan = planSend("  hi  ", "auto-submit", OFF);
    expect(plan).not.toBeNull();
    // ⚠️ VERBATIM — the surrounding spaces survive. The operator's text is not tidied.
    expect(plan?.body).toBe("  hi  ");
  });
});

describe("planSend — the label", () => {
  it("is the named constant, not a bare literal", () => {
    expect(STAGING_INJECT_LABEL).toBe("staging");
  });

  it("is carried on the plan for BOTH modes", () => {
    // The misattribution this guards is real and recorded: M13's skill row inherited
    // `injectCommand`'s `"auto-resume"` default, so every button failure read as an
    // auto-resume failure in the one diagnostic this path has.
    for (const mode of ["auto-submit", "stage-only"] as const) {
      expect(planSend("body", mode, OFF)?.label).toBe("staging");
    }
  });
});

describe("the two modes differ by EXACTLY the trailing CR", () => {
  it("auto-submit wraps in bracketed paste and appends one \\r OUTSIDE the envelope", () => {
    const plan = planSend("hello world", "auto-submit", OFF);
    const bytes = plan!.buildPayload();
    const binary = atob(bytes);
    const text = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    );
    expect(text).toBe(`${PASTE_START}hello world${PASTE_END}\r`);
  });

  it("stage-only wraps in the same envelope with NO trailing \\r", () => {
    const plan = planSend("hello world", "stage-only", OFF);
    const binary = atob(plan!.buildPayload());
    const text = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    );
    expect(text).toBe(`${PASTE_START}hello world${PASTE_END}`);
  });

  it("the two payloads differ by one byte and that byte is 0x0d", () => {
    // ⚠️ Asserted as a DIFFERENCE rather than as two independent literals. Two separate
    // equality checks both pass if the envelope silently changes in both modes at once; this
    // one pins the relationship that decision 1 is actually about.
    const auto = atob(planSend("x", "auto-submit", OFF)!.buildPayload());
    const stage = atob(planSend("x", "stage-only", OFF)!.buildPayload());
    const autoBytes = Uint8Array.from(auto, (c) => c.charCodeAt(0));
    const stageBytes = Uint8Array.from(stage, (c) => c.charCodeAt(0));

    expect(autoBytes.length - stageBytes.length).toBe(1);
    expect(autoBytes.at(-1)).toBe(0x0d);
    // ⚠️ `\r`, never `\n`: in raw mode CR IS Enter and LF only triggers autocomplete typeahead
    // (`[[raw-mode-cr-is-enter]]`, `[[cc-tui-cr-not-lf]]`).
    expect(autoBytes.at(-1)).not.toBe(0x0a);
    // And everything before it is identical.
    expect([...autoBytes.slice(0, -1)]).toEqual([...stageBytes]);
  });

  it("preserves interior newlines as CR inside the envelope — never normalized away", () => {
    // The measured reason F-a's multi-line gate dissolved: inside a bracketed-paste envelope a
    // `\r` is inserted as a literal newline rather than submitting. A multi-line dictation must
    // therefore arrive as ONE prompt with its line breaks intact, not as N truncated ones.
    const binary = atob(
      planSend("one\ntwo\nthree", "stage-only", OFF)!.buildPayload(),
    );
    const text = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    );
    expect(text).toBe(`${PASTE_START}one\rtwo\rthree${PASTE_END}`);
  });
});

describe("the plan reaches the REAL funnel with the values it carries", () => {
  // ⚠️ THE CENTRAL TEST OF THIS PHASE. `injectCommand` gained an optional `buildPayload`
  // parameter, and per `[[ts-arity-flexible-assignability-hides-a-widened-param]]` nothing in
  // `tsc` or a green suite proves a caller actually passes it. These drive the real funnel and
  // read what crossed the `invoke` boundary.

  it("auto-submit's bytes arrive at cc_input intact", async () => {
    const plan = planSend("compose me", "auto-submit", OFF)!;
    await injectCommand(
      "sess-1",
      plan.command,
      undefined,
      plan.label,
      plan.buildPayload,
    );

    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [command, args] = invokeMock.mock.calls[0] as [
      string,
      { sessionId: string; data: string },
    ];
    // ⚠️ The single injection funnel — `cc_input`, reached through `injectCommand`, NOT a
    // second path opened from the panel (F-a decision 2).
    expect(command).toBe("cc_input");
    expect(args.sessionId).toBe("sess-1");
    expect(sentText()).toBe(`${PASTE_START}compose me${PASTE_END}\r`);
  });

  it("stage-only's bytes arrive WITHOUT the submitting CR", async () => {
    const plan = planSend("compose me", "stage-only", OFF)!;
    await injectCommand(
      "sess-1",
      plan.command,
      undefined,
      plan.label,
      plan.buildPayload,
    );
    expect(sentText()).toBe(`${PASTE_START}compose me${PASTE_END}`);
  });

  it("the payload is the STAGED one, not what slashCommandPayload would have produced", async () => {
    // ⚠️ THE MUTATION THIS CATCHES: a caller that forgets to pass `buildPayload` still
    // compiles, still calls the funnel, and still reaches `cc_input` — it just silently sends
    // the WRONG BYTES (newlines stripped, one `\r` appended, no envelope), which for a
    // multi-line dictation fires as N truncated prompts. Asserting inequality against the
    // default is what makes the omission visible.
    const body = "line one\nline two";
    const plan = planSend(body, "stage-only", OFF)!;
    await injectCommand(
      "sess-1",
      plan.command,
      undefined,
      plan.label,
      plan.buildPayload,
    );
    const staged = sentText();

    invokeMock.mockClear();
    await injectCommand("sess-1", body); // the default path
    const defaulted = sentText();

    expect(staged).not.toBe(defaulted);
    expect(staged).toContain(PASTE_START);
    expect(defaulted).not.toContain(PASTE_START);
  });

  it("names the STAGING label in the diagnostic when the IPC rejects", async () => {
    // ⚠️ `console.warn` is the ONLY failure channel this path has. If the label did not reach
    // the funnel, a failed send would read as an *auto-resume* failure — pointing the single
    // available diagnostic at M12's arm. Asserting the warn TEXT is how the label is proven to
    // have been forwarded rather than accepted and dropped.
    invokeMock.mockRejectedValue(new Error("pty gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const plan = planSend("body", "auto-submit", OFF)!;
    await injectCommand(
      "sess-1",
      plan.command,
      undefined,
      plan.label,
      plan.buildPayload,
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("staging:");
    expect(line).not.toContain("auto-resume");
    // The command string stays HUMAN-READABLE in the diagnostic — a base64 blob here would
    // make the one available failure channel worthless.
    expect(line).toContain("staged prompt (auto-submit)");
    warn.mockRestore();
  });
});

describe("the widening left every existing caller byte-identical", () => {
  it("injectCommand with no builder still sends exactly slashCommandPayload's bytes", async () => {
    // ⚠️ THE REGRESSION GUARD FOR M12 / M13 / M15. The default parameter is the whole reason no
    // existing call site was touched; if it ever stops being `slashCommandPayload`, auto-resume,
    // the skill row and the supervisor all change bytes at once and silently.
    await injectCommand("sess-1", "/session-restore");
    const [, args] = invokeMock.mock.calls[0] as [
      string,
      { sessionId: string; data: string },
    ];
    expect(args.data).toBe(slashCommandPayload("/session-restore"));
    expect(sentText()).toBe("/session-restore\r");
  });

  it("the default path produces NO bracketed-paste envelope", async () => {
    // Stated separately because it is the property a future "unify the two builders" refactor
    // would break first, and it would break it invisibly.
    await injectCommand("sess-1", "/session-start");
    expect(sentText()).not.toContain(PASTE_START);
    expect(sentText()).not.toContain(PASTE_END);
  });
});

describe("planSend — the dictated wrap (paydown WP10)", () => {
  // UTF-8 decode, not bare `atob`: the open note carries an em dash.
  const decode = (b64: string): string =>
    new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );

  it("wraps the PAYLOAD when on, byte-for-byte, in both modes", () => {
    const wrapped = `${PASTE_START}${DICTATED_OPEN}\ra\rb\r${DICTATED_CLOSE}${PASTE_END}`;
    expect(
      decode(
        planSend("a\nb", "stage-only", { dictated: true })!.buildPayload(),
      ),
    ).toBe(wrapped);
    expect(
      decode(
        planSend("a\nb", "auto-submit", { dictated: true })!.buildPayload(),
      ),
    ).toBe(`${wrapped}\r`);
  });

  it("does NOT wrap when off", () => {
    expect(decode(planSend("a\nb", "stage-only", OFF)!.buildPayload())).toBe(
      `${PASTE_START}a\rb${PASTE_END}`,
    );
  });

  it("keeps `body` RAW either way — it is what gets archived, so a resend must not double-wrap", () => {
    for (const dictated of [true, false]) {
      expect(planSend("a\nb", "auto-submit", { dictated })!.body).toBe("a\nb");
    }
  });
});
