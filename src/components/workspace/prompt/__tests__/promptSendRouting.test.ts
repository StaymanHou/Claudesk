import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { sendModeForChord } from "../promptSendRouting";
import type { ChordEvent } from "../../chordEvent";

// F-a WP4 Phase 2 verify-codify — the send chords' ROUTING, and its live caller.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS CODIFIES THE ONE PROPERTY THE OPERATOR APPROVED THAT HAD NO TEST.
//
// verify-human confirmed in the live app that ⌘↵ / ⇧⌘↵ send from the Prompt panel. What no test
// covered was the SCOPING: that those chords are inert everywhere else. That is a safety
// property, not a nicety — `injectCommand` has no retry and no pre-send cancel window, so a send
// fired while the operator is looking at the editor is an unrecoverable write into a live
// conversation, recoverable only by CC's Esc.
//
// The decision was inline in `RightPanelHost`'s ~900-line keydown router, unreachable by any
// test. It was extracted to `promptSendRouting.ts` at codify precisely so this file could drive
// the real thing rather than assert a source-text shape
// (`[[extract-for-import-when-a-raw-guard-cant-express-the-property]]`).

const AUTO: ChordEvent = { metaKey: true, shiftKey: false, key: "Enter" };
const STAGE: ChordEvent = { metaKey: true, shiftKey: true, key: "Enter" };

/** The happy shape: Prompt panel front, handler registered. */
function front(event: ChordEvent) {
  return sendModeForChord({
    frontPanel: "prompt",
    hasSendHandler: true,
    event,
  });
}

describe("routes each chord to its own mode", () => {
  it("⌘↵ → auto-submit", () => {
    expect(front(AUTO)).toBe("auto-submit");
  });

  it("⇧⌘↵ → stage-only", () => {
    expect(front(STAGE)).toBe("stage-only");
  });

  it("returns null for a non-send key, so the router falls through", () => {
    // ⚠️ `null` means FALL THROUGH, not swallow. The caller only calls `preventDefault` on a
    // mode; if this returned a mode for a non-send key, that key would go dead app-wide.
    for (const key of ["a", "t", "w", "1", "9", "Escape", "Tab"]) {
      expect(front({ metaKey: true, shiftKey: false, key }), key).toBeNull();
    }
  });

  it("returns null for bare Enter — the key that inserts a newline in the buffer", () => {
    // If this routed, every paragraph break in a dictated prompt would fire a send.
    expect(front({ metaKey: false, shiftKey: false, key: "Enter" })).toBeNull();
  });
});

describe("the panel-front scoping — the safety property", () => {
  it("does NOT route while any other panel is front, for EITHER chord", () => {
    // ⚠️ Swept across every sibling panel rather than spot-checked on one. The regression being
    // guarded is "someone widens the router"; checking only `editor` would miss a widening that
    // happened to keep editor out.
    for (const panel of [
      "editor",
      "diff",
      "docs",
      "terminal",
      "finder",
      "search",
    ]) {
      for (const [name, event] of [
        ["auto-submit", AUTO],
        ["stage-only", STAGE],
      ] as const) {
        expect(
          sendModeForChord({
            frontPanel: panel,
            hasSendHandler: true,
            event,
          }),
          `${name} routed while ${panel} was front — a send with no undo`,
        ).toBeNull();
      }
    }
  });

  it("does NOT route when no send handler is registered", () => {
    // The panel registers its handler while mounted and unregisters on unmount. A chord arriving
    // in that window must not reach a torn-down panel's closure.
    expect(
      sendModeForChord({
        frontPanel: "prompt",
        hasSendHandler: false,
        event: AUTO,
      }),
    ).toBeNull();
  });

  it("BOTH guards are required — neither alone admits a send", () => {
    // ⚠️ A mutation dropping EITHER condition must fail something. Asserting the two-false and
    // each one-false case makes that true individually rather than relying on one combined case
    // (`[[behavioral-test-can-still-be-an-equivalent-mutant]]`).
    expect(
      sendModeForChord({
        frontPanel: "editor",
        hasSendHandler: false,
        event: AUTO,
      }),
    ).toBeNull();
    expect(
      sendModeForChord({
        frontPanel: "editor",
        hasSendHandler: true,
        event: AUTO,
      }),
    ).toBeNull();
    expect(
      sendModeForChord({
        frontPanel: "prompt",
        hasSendHandler: false,
        event: AUTO,
      }),
    ).toBeNull();
    // ...and only the all-true case routes.
    expect(
      sendModeForChord({
        frontPanel: "prompt",
        hasSendHandler: true,
        event: AUTO,
      }),
    ).toBe("auto-submit");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE LIVE-CALLER GUARD. A pure decision module's own tests CANNOT see that nothing calls it
// — they call it themselves. `planPanelChange` shipped exported, documented and fully tested
// with ZERO callers, so its module promised a flush the panel never performed
// (`[[extracted-machine-needs-a-live-caller-guard]]`). Extracting this router out of
// `RightPanelHost` created exactly that risk, so the caller is asserted here.
const hostSource = readFileSync(
  fileURLToPath(new URL("../../RightPanelHost.tsx", import.meta.url)),
  "utf8",
);

/** Strip comments so no assertion below can be satisfied by prose. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("RightPanelHost actually calls the router", () => {
  it("calls sendModeForChord in comment-stripped source", () => {
    // ⚠️ Comments stripped FIRST: this module is discussed at length in the host's prose, and an
    // identifier assertion satisfied by a comment passes exactly when the code was deleted
    // (`[[raw-guard-identifier-satisfied-by-own-comments]]`). The CALL shape `fn(` is asserted,
    // not the bare name.
    expect(stripComments(hostSource)).toContain("sendModeForChord(");
  });

  it("guards the call with a null check rather than preventDefault-ing every Enter", () => {
    // The fall-through contract, asserted at the caller: a non-match must leave the event alone.
    expect(stripComments(hostSource)).toContain("sendMode !== null");
  });

  it("meta: the host source actually loaded", () => {
    // ⚠️ A failed read yields "" and every `toContain` above would fail loudly — but a TRUNCATED
    // read would not, so the size is checked too.
    expect(hostSource.length).toBeGreaterThan(1000);
    expect(hostSource).toContain("RightPanelHost");
  });
});
