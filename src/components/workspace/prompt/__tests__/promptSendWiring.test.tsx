// @vitest-environment jsdom
//
// ⚠️ Needed because the panel and its store read browser globals (`localStorage`, `document`),
// and because this file MOUNTS the panel. Scoped per-file, the convention
// `promptTabIndicatorRender.test.tsx` established.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

// ⚠️ Mock the TAURI boundary, not our own funnel. Mocking `injectCommand` would make this file
// assert that a test double was called — the replica trap
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`). Stubbing `invoke`
// drives the REAL panel → REAL `planSend` → REAL `injectCommand` → the IPC edge.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

const { PromptPanel } = await import("../PromptPanel");
const { saveDraft, loadDraft, DRAFT_KEY_PREFIX } =
  await import("../../draftStore");
const { loadHistory, clearHistory } = await import("../../draftHistory");
const { PASTE_START, PASTE_END, DICTATED_OPEN, DICTATED_CLOSE } =
  await import("../../stagedPayload");
const { PROMPT_DICTATED_WRAP_KEY } = await import("../promptDictatedWrap");

/** Paydown WP10: the dictated wrap is ON by default, so a default send carries the notes. */
const wrapped = (body: string) =>
  `${PASTE_START}${DICTATED_OPEN}\r${body}\r${DICTATED_CLOSE}${PASTE_END}`;
type SendMode = import("../sendStagedDraft").SendMode;

// F-a WP4 Phase 2 (task 4.5), rebuilt at paydown 2026-09-23 WP7 (AH1) — the send's BEHAVIOUR:
// bytes, label, and clear-and-archive, performed BY THE MOUNTED PANEL.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS FILE DRIVES THE PANEL'S OWN SEND CLOSURE. The panel hands `send` to its host through
// `onRegisterSend` (that is how the ⌘↵ / ⇧⌘↵ chords reach it), so the test captures exactly the
// function the host calls. The previous version re-implemented the sequence in a local helper
// and so proved the SEQUENCE, not that the panel performs it.
//
// ⚠️ WHAT IT CANNOT SEE — ARCHIVE-BEFORE-CLEAR. `send` reads the body into a local before doing
// anything, so swapping `appendToHistory` and `clearDraft` in the panel archives the same text
// either way. That mutant is EQUIVALENT here: no outcome of this panel differs
// (`[[behavioral-test-can-still-be-an-equivalent-mutant]]`). The order is pinned by
// `promptDraftSync.test.ts`'s source-order guard, which matters if the body is ever re-read
// after the clear. This file does not claim it.
//
// ⚠️ Per `[[ts-arity-flexible-assignability-hides-a-widened-param]]`, every assertion reads the
// VALUE that crossed `invoke` rather than counting calls.

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const PROJECT = "/tmp/scratch/send-wiring";

// A throw inside a DOM listener is swallowed under Vitest jsdom unless `window` `error` is
// tapped (`[[jsdom-listener-throw-is-silent-in-vitest]]`); a click handler is one.
const uncaught: unknown[] = [];
const onError = (e: ErrorEvent) => uncaught.push(e.error ?? e.message);

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let registered: ((mode: SendMode) => void) | null = null;

function panel(ccSessionId: string | null) {
  return (
    <PromptPanel
      projectPath={PROJECT}
      visible
      panelFront
      ccSessionId={ccSessionId}
      onRegisterSend={(fn) => {
        registered = fn;
      }}
    />
  );
}

/** Mount the real panel, seeded with `draft` through the real store. */
function mount(draft: string, ccSessionId: string | null = "sess-1") {
  saveDraft(PROJECT, draft);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(panel(ccSessionId)));
  if (!registered) throw new Error("the panel never registered its send");
  return host;
}

/** Call the closure the panel registered — the one the host's send chords call. */
async function send(mode: SendMode) {
  await act(async () => {
    registered!(mode);
  });
  // `injectCommand` awaits `invoke`, and its failure path logs after the rejection settles.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

/** Decode what crossed the `invoke` boundary. */
function lastInvoke(): { command: string; sessionId: string; text: string } {
  const call = invokeMock.mock.calls.at(-1);
  if (!call) throw new Error("invoke was never called");
  const [command, args] = call as [string, { sessionId: string; data: string }];
  const text = new TextDecoder().decode(
    Uint8Array.from(atob(args.data), (c) => c.charCodeAt(0)),
  );
  return { command, sessionId: args.sessionId, text };
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined);
  localStorage.clear();
  clearHistory(PROJECT);
  registered = null;
  uncaught.length = 0;
  window.addEventListener("error", onError);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  window.removeEventListener("error", onError);
  expect(uncaught).toEqual([]);
});

describe("the harness is live", () => {
  it("mounts the real panel with its CM6 host, seeded from the store", () => {
    // ⚠️ POSITIVE CONTROL for every test below: if the seed did not reach the editor, a
    // "draft cleared" assertion would pass on a panel that never held a draft.
    const el = mount("seeded text");
    expect(el.querySelector('[data-testid="prompt-panel"]')).not.toBeNull();
    expect(el.querySelector(".cm-content")?.textContent).toBe("seeded text");
    expect(registered).toBeTypeOf("function");
  });
});

describe("auto-submit send", () => {
  it("sends the bracketed-paste envelope WITH the submitting CR, through cc_input", async () => {
    mount("write the thing");
    await send("auto-submit");
    const sent = lastInvoke();
    expect(sent.command).toBe("cc_input");
    expect(sent.text).toBe(`${wrapped("write the thing")}\r`);
  });

  it("clears the persisted draft AND the rendered buffer", async () => {
    const el = mount("sent text");
    await send("auto-submit");
    expect(loadDraft(PROJECT)).toBe("");
    expect(el.querySelector(".cm-content")?.textContent).toBe("");
  });

  it("archives the sent text, and the recover list shows it at once", async () => {
    const el = mount("first message");
    await send("auto-submit");
    expect(loadHistory(PROJECT)[0]).toBe("first message");
    // The panel consumes `appendToHistory`'s return value, so the list updates without a remount.
    expect(
      el.querySelector('[data-testid="prompt-recover-toggle"]')?.textContent,
    ).toContain("Recent (1)");
  });
});

describe("stage-only send", () => {
  it("sends the same envelope WITHOUT the submitting CR", async () => {
    mount("half a thought");
    await send("stage-only");
    expect(lastInvoke().text).toBe(wrapped("half a thought"));
  });

  it("ALSO clears and archives — both modes do", async () => {
    // ⚠️ The asymmetry that would be easy to introduce: treating stage-only as "not really
    // sent" and skipping the archive. The text has LEFT the panel either way, so the recovery
    // net must exist either way.
    mount("staged text");
    await send("stage-only");
    expect(loadDraft(PROJECT)).toBe("");
    expect(loadHistory(PROJECT)[0]).toBe("staged text");
  });

  it("the Stage BUTTON reaches the same send as the chord", async () => {
    const el = mount("clicked");
    await act(async () => {
      el.querySelector<HTMLButtonElement>(
        '[data-testid="prompt-send-stage"]',
      )!.click();
    });
    expect(lastInvoke().text).toBe(wrapped("clicked"));
  });
});

describe("the dictated toggle reaches the send (paydown WP10)", () => {
  // ⚠️ The pure builder's tests prove the MACHINE; this block proves the panel's CALLER threads
  // the toggle through. A send closure that ignored it (hardcoded ON) would pass every
  // `stagedPayload` test and fail the OFF case here.
  const toggle = (el: HTMLElement) =>
    el.querySelector<HTMLInputElement>(
      '[data-testid="prompt-dictated-toggle"]',
    )!;

  it("renders checked by default", () => {
    const el = mount("x");
    expect(toggle(el).checked).toBe(true);
  });

  it("unticked, the send goes out UNWRAPPED, and the choice is persisted", async () => {
    const el = mount("typed not dictated");
    await act(async () => {
      toggle(el).click();
    });
    expect(toggle(el).checked).toBe(false);
    expect(localStorage.getItem(PROMPT_DICTATED_WRAP_KEY)).toBe("false");
    await send("auto-submit");
    expect(lastInvoke().text).toBe(
      `${PASTE_START}typed not dictated${PASTE_END}\r`,
    );
  });

  it("a persisted OFF is read at mount", async () => {
    localStorage.setItem(PROMPT_DICTATED_WRAP_KEY, "false");
    const el = mount("again");
    expect(toggle(el).checked).toBe(false);
    await send("stage-only");
    expect(lastInvoke().text).toBe(`${PASTE_START}again${PASTE_END}`);
  });

  it("archives the RAW body when wrapped, so a recover-and-resend cannot double-wrap", async () => {
    mount("dictated words");
    await send("auto-submit");
    expect(lastInvoke().text).toBe(`${wrapped("dictated words")}\r`);
    expect(loadHistory(PROJECT)[0]).toBe("dictated words");
  });
});

describe("the session id is read at SEND time", () => {
  it("a re-render with a new ccSessionId addresses the new PTY", async () => {
    // ⚠️ A Recycle swaps the session id while the panel stays mounted. The registered `send` is
    // deliberately identity-stable, so a value closed over at mount would address a dead PTY.
    mount("after recycle", "sess-old");
    act(() => root!.render(panel("sess-new")));
    await send("auto-submit");
    expect(lastInvoke().sessionId).toBe("sess-new");
  });
});

describe("successive sends", () => {
  it("stack newest-first in the ring", async () => {
    mount("older");
    await send("auto-submit");
    // Type the next draft through the store's own seed path: unmount, re-seed, remount.
    act(() => root!.unmount());
    host!.remove();
    registered = null;
    mount("newer");
    await send("stage-only");
    expect(loadHistory(PROJECT).slice(0, 2)).toEqual(["newer", "older"]);
  });
});

describe("the failure diagnostic names STAGING, not auto-resume", () => {
  it("warns with the staging label when the IPC rejects", async () => {
    // ⚠️ `console.warn` is the ONLY failure channel this path has. A send that failed while
    // labelled `auto-resume` would point the single available diagnostic at M12's arm.
    invokeMock.mockRejectedValue(new Error("pty gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount("body");
    await send("auto-submit");
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("staging:");
    expect(line).not.toContain("auto-resume");
    warn.mockRestore();
  });

  it("a failed send still clears and archives — the bytes were written", async () => {
    // ⚠️ DELIBERATE, and worth stating because it looks like a bug: `injectCommand` swallows
    // the rejection, and there is no readback (F-a decision 3 — stage-only's success is
    // unverifiable, "do not build machinery to close this"). The text is in the ring, which is
    // the recovery net; making the clear conditional on an unknowable outcome would be worse.
    invokeMock.mockRejectedValue(new Error("pty gone"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount("into the void");
    await send("auto-submit");
    expect(loadDraft(PROJECT)).toBe("");
    expect(loadHistory(PROJECT)).toContain("into the void");
    warn.mockRestore();
  });
});

describe("the storage keys are the WP2 ones — a persisted wire format", () => {
  it("writes the draft under the claudesk.staging. prefix despite the UI saying Prompt", () => {
    // ⚠️ Deliberate and documented at both constants: renaming a persisted key to chase a UI
    // label would orphan every draft already on disk. Pinned so a future tidy-up trips here.
    saveDraft(PROJECT, "x");
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith(DRAFT_KEY_PREFIX))).toBe(true);
    expect(DRAFT_KEY_PREFIX).toContain("staging");
  });
});
