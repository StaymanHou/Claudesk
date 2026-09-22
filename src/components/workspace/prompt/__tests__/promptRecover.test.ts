import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  planRecover,
  DISCARD_CONFIRM_MESSAGE,
  discardConfirmSpec,
} from "../promptRecover";

// F-a WP4 Phase 3 (P3.2) — the recovery decision.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ CONFIRM-THEN-OVERWRITE, BY OPERATOR RULING (2026-09-22). An earlier implementation APPENDED;
// that was rejected. The contract now: recovering into a buffer holding unsent text must ASK
// before destroying it, and confirming REPLACES rather than merges.
//
// ⚠️ The property that matters is no longer "never returns less text" (that was append's
// contract). It is: **no path silently destroys unsent work.** A `confirm` arm is the only way a
// non-empty buffer can be replaced.

describe("EMPTY buffer — nothing to lose, so no prompt", () => {
  it("replaces immediately", () => {
    expect(planRecover("", "restored text")).toEqual({
      kind: "replace",
      text: "restored text",
    });
  });

  it("treats a whitespace-only buffer as empty", () => {
    // ⚠️ Not pedantry: prompting over `"   "` would train the operator to dismiss the dialog
    // reflexively, which is exactly how a confirm stops protecting anything.
    for (const blank of ["", "   ", "\n", "\t\n  "]) {
      expect(planRecover(blank, "restored"), JSON.stringify(blank)).toEqual({
        kind: "replace",
        text: "restored",
      });
    }
  });
});

describe("NON-EMPTY buffer — the discard guard", () => {
  it("asks before replacing", () => {
    // ⚠️ THE CENTRAL ASSERTION. An implementation that replaced unconditionally returns
    // `replace` here and passes every empty-buffer test above, so this is the case that
    // distinguishes them.
    expect(planRecover("unsent work", "restored")).toEqual({
      kind: "confirm",
      text: "restored",
    });
  });

  it("asks for ANY non-blank buffer, however small", () => {
    // Swept rather than spot-checked: the regression guarded is "someone adds a length
    // threshold". One character of unsent work is still unsent work.
    for (const current of ["a", ".", "x y", "  padded  ", "multi\nline"]) {
      expect(planRecover(current, "entry").kind, current).toBe("confirm");
    }
  });

  it("carries the ENTRY on the confirm arm, not the current buffer", () => {
    // ⚠️ The text the caller applies after the dialog must be what was RECOVERED. Carrying it
    // here is what lets the panel avoid re-reading the buffer once the prompt closes — the
    // operator could have edited it meanwhile.
    const action = planRecover("unsent", "the recovered entry");
    expect(action.text).toBe("the recovered entry");
  });

  it("NEVER returns a joined string — replacement, not merge", () => {
    // ⚠️ The append implementation this REVERSED returned `current + "\n\n" + entry`. Asserting
    // the absence of the old shape is what makes the reversal durable: a well-meaning
    // "restore the old behaviour" would fail here.
    const action = planRecover("unsent work", "restored");
    expect(action.text).not.toContain("unsent work");
    expect(action.text).not.toContain("\n\n");
    expect(action.text).toBe("restored");
  });
});

describe("the confirmation message", () => {
  it("names the consequence rather than asking a bare 'are you sure?'", () => {
    // A prompt that does not say what is lost is one the operator cannot decide from.
    expect(DISCARD_CONFIRM_MESSAGE.toLowerCase()).toContain("discard");
  });
});

describe("the dialog spec — the two SAFETY-CRITICAL props", () => {
  // ⚠️ CODIFIED AT verify-codify BECAUSE THE LIVE CHECK PROVED IT AND NOTHING TESTED IT.
  // `ConfirmModal` focuses the `variant: "primary"` button on open, so THAT is what Enter
  // activates, and `escValue` is what Esc / backdrop-click resolve to. Both are JSX props —
  // the exact class this project's gate cannot see (WP3 shipped two prop defects past a fully
  // green 2859-test run). Putting `primary` on "Discard" is a one-word change that makes Enter
  // destroy the buffer, with no type error and nothing in a comment-stripped grep to catch it.

  it("CANCEL is the primary (focused, Enter-activated) button", () => {
    const spec = discardConfirmSpec();
    const primary = spec.buttons.find((b) => b.variant === "primary");
    expect(
      primary,
      "no primary button — ConfirmModal would focus the first",
    ).toBeTruthy();
    expect(
      primary!.value,
      "the DESTRUCTIVE arm must never be the focused default — Enter would discard the buffer",
    ).toBe("cancel");
  });

  it("DISCARD carries the danger variant, and is NOT primary", () => {
    const discard = spec_button("discard");
    expect(discard.variant).toBe("danger");
    expect(discard.variant).not.toBe("primary");
  });

  it("Esc and backdrop-click resolve to CANCEL", () => {
    // ⚠️ `escValue` non-null is also what makes the dialog dismissible at all. Were it the
    // discard arm, a stray Esc would destroy the buffer — the opposite of a safe default.
    expect(discardConfirmSpec().escValue).toBe("cancel");
  });

  it("exactly one button is primary", () => {
    // ConfirmModal takes `findIndex(variant === "primary")`, so two primaries silently means
    // "the first one wins" — an ordering dependency nobody would expect to be load-bearing.
    const primaries = discardConfirmSpec().buttons.filter(
      (b) => b.variant === "primary",
    );
    expect(primaries.length).toBe(1);
  });

  it("offers exactly the two ruled choices", () => {
    // The operator ruled for cancel-or-overwrite. A third option (e.g. a resurrected "append")
    // would be a silent re-litigation of a decision already made.
    expect(discardConfirmSpec().buttons.map((b) => b.value)).toEqual([
      "cancel",
      "discard",
    ]);
  });

  it("the message it shows is the exported one, not a drifted copy", () => {
    expect(discardConfirmSpec().message).toBe(DISCARD_CONFIRM_MESSAGE);
  });
});

/** Look up a button by value, failing loudly rather than returning undefined. */
function spec_button(value: string) {
  const b = discardConfirmSpec().buttons.find((x) => x.value === value);
  if (!b) throw new Error(`no button with value ${value}`);
  return b;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ THE LIVE-CALLER GUARD — a pure module's own tests cannot see that nothing calls it, because
// they call it themselves (`[[extracted-machine-needs-a-live-caller-guard]]`).
const panelSource = readFileSync(
  fileURLToPath(new URL("../PromptPanel.tsx", import.meta.url)),
  "utf8",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("PromptPanel actually calls the recovery decision", () => {
  it("calls planRecover in comment-stripped source", () => {
    // ⚠️ Comments stripped first: the panel DISCUSSES recovery at length, and an identifier
    // assertion satisfied by prose passes exactly when the code was deleted
    // (`[[raw-guard-identifier-satisfied-by-own-comments]]`). The CALL shape is asserted.
    expect(stripComments(panelSource)).toContain("planRecover(");
  });

  it("uses the EXTRACTED spec rather than an inline literal", () => {
    // ⚠️ An inline `spec={{ ... }}` puts the safety-critical props back out of reach of the
    // tests above — they would assert a function nothing calls.
    expect(stripComments(panelSource)).toContain("discardConfirmSpec()");
  });

  it("renders a ConfirmModal for the confirm arm", () => {
    // The decision is worthless if nothing asks. A `confirm` action with no dialog would leave
    // the recover silently inert — worse than either shipped behaviour.
    expect(stripComments(panelSource)).toContain("ConfirmModal");
  });

  it("routes the recovered text through the SAME write funnel as any edit", () => {
    // ⚠️ Not a second `saveDraft` call site — that shape shipped a CRITICAL twice in M11 WP4.
    expect(stripComments(panelSource)).toContain("runPlan(planEdit(");
  });

  it("the old APPEND implementation is gone from the panel", () => {
    // ⚠️ Pins the reversal at the caller too, not just in the module. `recoverInto` was the
    // append-era export; its reappearance here would mean the merge behaviour came back.
    expect(stripComments(panelSource)).not.toContain("recoverInto");
  });

  it("the CONFIRM arm routes to the dialog, NOT straight to the buffer", () => {
    // ⚠️ THIS GUARD EXISTS BECAUSE A MUTANT SURVIVED. Replacing the panel's
    // `setPendingRecover(action.text)` with `applyRecover(action.text)` — i.e. applying the
    // recovered text WITHOUT ever showing the dialog — passed all 130 tests in this suite.
    // Every other guard here asserts that `planRecover` and `ConfirmModal` are PRESENT; none
    // asserted that the confirm arm actually REACHES the dialog. That is the
    // proven-machine-with-an-unguarded-caller shape this project has shipped a CRITICAL from
    // twice (M11 WP4), and the decision module's own tests structurally cannot see it.
    //
    // ⚠️ Asserted as an ORDER relationship rather than a bare `toContain`: `applyRecover(` also
    // occurs legitimately on the `replace` arm and inside the dialog's own handler, so a
    // presence check would pass on the mutant (`[[raw-guard-substring-must-be-unique-to-its-site]]`).
    const src = stripComments(panelSource);
    const armCheck = src.indexOf('action.kind === "replace"');
    const pending = src.indexOf("setPendingRecover(action.text)");
    expect(armCheck, "the `replace` arm check is missing").toBeGreaterThan(-1);
    expect(
      pending,
      "the confirm arm must hand the entry to the dialog via setPendingRecover — applying it " +
        "directly skips the discard confirmation the operator ruled for",
    ).toBeGreaterThan(armCheck);
  });

  it("the confirm arm does NOT call applyRecover before the dialog", () => {
    // The complement of the above, stated as the negative the mutant produced: between the arm
    // check and the pending-set there must be exactly ONE `applyRecover(` (the `replace` arm's).
    const src = stripComments(panelSource);
    const armCheck = src.indexOf('action.kind === "replace"');
    const pending = src.indexOf("setPendingRecover(action.text)");
    const between = src.slice(armCheck, pending);
    const calls = between.match(/\bapplyRecover\(/g) ?? [];
    expect(
      calls.length,
      "only the `replace` arm may apply directly; a second call here is the confirm bypass",
    ).toBe(1);
  });

  it("meta: the panel source actually loaded", () => {
    expect(panelSource.length).toBeGreaterThan(1000);
    expect(panelSource).toContain("PromptPanel");
  });
});
