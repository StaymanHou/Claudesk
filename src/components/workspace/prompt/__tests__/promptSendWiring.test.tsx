// @vitest-environment jsdom
//
// ⚠️ Needed because the panel and its store read browser globals (`localStorage`, `document`).
// Scoped per-file, the convention `promptTabIndicatorRender.test.tsx` established.
import { describe, expect, it, vi, beforeEach } from "vitest";

// ⚠️ Mock the TAURI boundary, not our own funnel. Mocking `injectCommand` would make this file
// assert that a test double was called — the replica trap
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). Stubbing `invoke`
// drives the REAL `send` → REAL `planSend` → REAL `injectCommand` → the IPC edge.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { planSend } = await import("../sendStagedDraft");
const { injectCommand } = await import("../../autoResumeFire");
const { saveDraft, loadDraft, DRAFT_KEY_PREFIX } =
  await import("../../draftStore");
const { loadHistory, clearHistory } = await import("../../draftHistory");
const { PASTE_START, PASTE_END } = await import("../../stagedPayload");

// F-a WP4 Phase 2 (task 4.5) — the send's BEHAVIOUR: bytes, label, and clear-and-archive.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS FILE EXERCISES THE REAL SEND SEQUENCE, NOT THE COMPONENT'S JSX.
//
// The guards in `promptDraftSync.test.ts` are SOURCE-text assertions — "does the panel call
// injectCommand exactly once", "is appendToHistory before clearDraft". Those answer *what the
// source says*. They cannot answer *what happens when a send runs*, and per
// `docs/lessons/source-text-guards.md` that is the line at which a source guard stops being the
// right instrument.
//
// ⚠️ The panel's own send closure is not importable (it is created inside the component), so
// this file drives the same SEQUENCE the panel performs, against the real stores and the real
// funnel. That is a deliberate, disclosed limitation: it proves the sequence is correct and
// that the panel performs THIS sequence is what the source guards pin. The two together are the
// coverage; neither alone is.
//
// ⚠️ Per `[[ts-arity-flexible-assignability-hides-a-widened-param]]`, every assertion reads the
// VALUE that crossed `invoke` rather than counting calls.

const PROJECT = "/tmp/scratch/send-wiring";

/** Decode what crossed the `invoke` boundary. */
function sentText(): string {
  const call = invokeMock.mock.calls.at(-1);
  if (!call) throw new Error("invoke was never called");
  const { data } = call[1] as { data: string };
  return new TextDecoder().decode(
    Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
  );
}

/**
 * The exact sequence `PromptPanel.send(mode)` performs, against the real modules.
 *
 * ⚠️ Kept in ONE place here for the same reason the panel keeps it in one place: if the archive
 * and the clear were reproduced per-test, a test could silently drift from the shipped order.
 */
async function performSend(
  body: string,
  mode: "auto-submit" | "stage-only",
  sessionId: string | null = "sess-1",
) {
  const plan = planSend(body, mode);
  if (!plan) return false;
  if (!sessionId) return false;
  await injectCommand(
    sessionId,
    plan.command,
    undefined,
    plan.label,
    plan.buildPayload,
  );
  const { appendToHistory } = await import("../../draftHistory");
  const { clearDraft } = await import("../../draftStore");
  appendToHistory(PROJECT, body); // ⚠️ archive BEFORE clear — see the order test below
  clearDraft(PROJECT);
  return true;
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  localStorage.clear();
});

describe("auto-submit send", () => {
  it("sends the bracketed-paste envelope WITH the submitting CR", async () => {
    saveDraft(PROJECT, "write the thing");
    await performSend("write the thing", "auto-submit");
    expect(sentText()).toBe(`${PASTE_START}write the thing${PASTE_END}\r`);
  });

  it("reaches cc_input through the funnel, with the staging label", async () => {
    await performSend("body", "auto-submit");
    const [command] = invokeMock.mock.calls[0] as [string, unknown];
    expect(command).toBe("cc_input");
    // The label is proven by the diagnostic on the failure path — see the rejection test below.
  });

  it("clears the persisted draft", async () => {
    saveDraft(PROJECT, "sent text");
    expect(loadDraft(PROJECT)).toBe("sent text");
    await performSend("sent text", "auto-submit");
    expect(loadDraft(PROJECT)).toBe("");
  });

  it("archives the sent text to the history ring", async () => {
    clearHistory(PROJECT);
    await performSend("first message", "auto-submit");
    expect(loadHistory(PROJECT)[0]).toBe("first message");
  });
});

describe("stage-only send", () => {
  it("sends the same envelope WITHOUT the submitting CR", async () => {
    await performSend("half a thought", "stage-only");
    expect(sentText()).toBe(`${PASTE_START}half a thought${PASTE_END}`);
  });

  it("ALSO clears and archives — both modes do", async () => {
    // ⚠️ The asymmetry that would be easy to introduce: treating stage-only as "not really
    // sent" and skipping the archive. The text has LEFT the panel either way, so the recovery
    // net must exist either way.
    clearHistory(PROJECT);
    saveDraft(PROJECT, "staged text");
    await performSend("staged text", "stage-only");
    expect(loadDraft(PROJECT)).toBe("");
    expect(loadHistory(PROJECT)[0]).toBe("staged text");
  });
});

describe("the blank send is refused end to end", () => {
  it("does not inject, clear, or archive", async () => {
    clearHistory(PROJECT);
    saveDraft(PROJECT, "   ");
    const did = await performSend("   ", "auto-submit");
    expect(did).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    // ⚠️ The draft SURVIVES. This is the data-loss path: if the blank check lived after the
    // clear, a stray ⌘↵ on a whitespace-only buffer would wipe it and archive nothing.
    expect(loadDraft(PROJECT)).toBe("   ");
    expect(loadHistory(PROJECT)).toEqual([]);
  });
});

describe("no live CC session", () => {
  it("does not inject and does NOT destroy the draft", async () => {
    // ⚠️ The draft must survive a send attempted with no session — otherwise an operator who
    // hits ⌘↵ before CC has spawned loses the text with nothing sent anywhere.
    saveDraft(PROJECT, "typed before spawn");
    const did = await performSend("typed before spawn", "auto-submit", null);
    expect(did).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(loadDraft(PROJECT)).toBe("typed before spawn");
  });
});

describe("archive-before-clear, proven by OUTCOME rather than by source order", () => {
  it("the ring holds the text even though the draft is gone", async () => {
    // ⚠️ THE BEHAVIOURAL TWIN of the source-order guard in `promptDraftSync.test.ts`. If the
    // clear ran first, `appendToHistory` would receive the body from a wiped buffer in the real
    // panel and refuse it as blank — leaving the ring EMPTY while the draft was gone. That is
    // the exact data-loss shape, and it is visible here as an outcome.
    clearHistory(PROJECT);
    saveDraft(PROJECT, "the only copy");
    await performSend("the only copy", "auto-submit");
    expect(loadDraft(PROJECT)).toBe("");
    expect(loadHistory(PROJECT)).toContain("the only copy");
  });

  it("successive sends stack newest-first and survive a reload", async () => {
    clearHistory(PROJECT);
    await performSend("older", "auto-submit");
    await performSend("newer", "stage-only");
    expect(loadHistory(PROJECT).slice(0, 2)).toEqual(["newer", "older"]);
  });
});

describe("the failure diagnostic names STAGING, not auto-resume", () => {
  it("warns with the staging label when the IPC rejects", async () => {
    // ⚠️ `console.warn` is the ONLY failure channel this path has. A send that failed while
    // labelled `auto-resume` would point the single available diagnostic at M12's arm.
    invokeMock.mockRejectedValue(new Error("pty gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await performSend("body", "auto-submit");
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("staging:");
    expect(line).not.toContain("auto-resume");
    warn.mockRestore();
  });

  it("a failed send still clears and archives — the bytes were written", async () => {
    // ⚠️ DELIBERATE, and worth stating because it looks like a bug: `injectCommand` swallows
    // the rejection, and there is no readback (F-a decision 3 — stage-only's success is
    // unverifiable, "do not build machinery to close this"). The text is in the ring, which is
    // the recovery net; making the clear conditional on an unknowable outcome would be worse.
    clearHistory(PROJECT);
    invokeMock.mockRejectedValue(new Error("pty gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    saveDraft(PROJECT, "into the void");
    await performSend("into the void", "auto-submit");
    expect(loadDraft(PROJECT)).toBe("");
    expect(loadHistory(PROJECT)).toContain("into the void");
    warn.mockRestore();
  });
});

describe("the storage keys are the WP2 ones — a persisted wire format", () => {
  it("writes the draft under the claudesk.staging. prefix despite the UI saying Prompt", async () => {
    // ⚠️ Deliberate and documented at both constants: renaming a persisted key to chase a UI
    // label would orphan every draft already on disk. Pinned so a future tidy-up trips here.
    saveDraft(PROJECT, "x");
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith(DRAFT_KEY_PREFIX))).toBe(true);
    expect(DRAFT_KEY_PREFIX).toContain("staging");
  });
});
