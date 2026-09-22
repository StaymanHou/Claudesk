import { describe, expect, it } from "vitest";
import {
  DRAFT_DEBOUNCE_MS,
  planEdit,
  planFlush,
  planPanelChange,
  planProjectSwitch,
  type PendingWrite,
} from "../promptDraftSync";
// ?raw imports for the funnel guard at the foot of this file.
import panelSource from "../PromptPanel.tsx?raw";
import { stripComments } from "./stripComments";
import syncSource from "../promptDraftSync.ts?raw";

const pending = (projectPath: string, text: string): PendingWrite => ({
  projectPath,
  text,
});

describe("planEdit — an edit never writes eagerly", () => {
  it("holds the text as pending and writes nothing", () => {
    const plan = planEdit("/a", "hello");
    expect(plan.write).toBeNull();
    expect(plan.pending).toEqual({ projectPath: "/a", text: "hello" });
  });

  it("captures the project path WITH the text, not just the text", () => {
    // ⚠️ THE PROJECT-SWITCH CORRECTNESS PROPERTY, asserted at its source. If the pending
    // write carried only the text, a later flush would have to look the path up — and a
    // flush that runs after a switch would then write project A's draft into project B.
    // Asserted as an OBJECT EQUALITY rather than `toBeTruthy()`, so dropping the field
    // fails here rather than three modules away.
    expect(planEdit("/proj-a", "text").pending).toEqual({
      projectPath: "/proj-a",
      text: "text",
    });
  });

  it("preserves an empty edit as pending (clearing the buffer must persist)", () => {
    // Emptying the draft is a real state that must reach storage — `saveDraft` turns ""
    // into a key deletion. Treating "" as "nothing to do" would strand the old text.
    expect(planEdit("/a", "").pending).toEqual({ projectPath: "/a", text: "" });
  });
});

describe("planFlush — the pending write, verbatim", () => {
  it("returns the pending write for execution and clears pending", () => {
    const p = pending("/a", "draft text");
    const plan = planFlush(p);
    expect(plan.write).toBe(p);
    expect(plan.pending).toBeNull();
  });

  it("returns the write at its OWN captured path, not a substituted one", () => {
    // The flush must be a pure pass-through of what was captured. Asserted by identity of
    // the path field, because a length/truthiness check would pass for the wrong path.
    expect(planFlush(pending("/original", "t")).write?.projectPath).toBe(
      "/original",
    );
  });

  it("is a safe no-op when nothing is pending", () => {
    const plan = planFlush(null);
    expect(plan.write).toBeNull();
    expect(plan.pending).toBeNull();
  });
});

describe("planProjectSwitch — flush the OUTGOING project at its own path", () => {
  it("flushes the pending write when the path really changed", () => {
    const p = pending("/from", "unsaved");
    const plan = planProjectSwitch(p, "/from", "/to");
    expect(plan.write).toBe(p);
    expect(plan.pending).toBeNull();
  });

  it("⚠️ writes to the OUTGOING path even though the panel is moving to a new one", () => {
    // The single most important assertion in this file. The text was typed in `/from` and
    // must land in `/from`'s key — writing it to `/to` would silently overwrite the
    // incoming project's draft with the outgoing project's text.
    //
    // Asserted as a POSITIVE identity on `/from` AND a NEGATIVE on `/to`: checking only
    // "not /to" would also pass for `undefined`, and checking only "is /from" would pass
    // for an implementation that happened to return both.
    const plan = planProjectSwitch(
      pending("/from", "typed here"),
      "/from",
      "/to",
    );
    expect(plan.write?.projectPath).toBe("/from");
    expect(plan.write?.projectPath).not.toBe("/to");
    expect(plan.write?.text).toBe("typed here");
  });

  it("is a NO-OP when the path did not actually change", () => {
    // React effects re-run for reasons that are not real changes. Treating each as a
    // switch would flush on every render and defeat the debounce entirely — so the
    // pending write must survive untouched, not merely "not be written".
    const p = pending("/same", "still typing");
    const plan = planProjectSwitch(p, "/same", "/same");
    expect(plan.write).toBeNull();
    expect(plan.pending).toBe(p);
  });

  it("handles a switch with nothing pending", () => {
    const plan = planProjectSwitch(null, "/from", "/to");
    expect(plan.write).toBeNull();
    expect(plan.pending).toBeNull();
  });
});

describe("planPanelChange — leaving the Prompt tab flushes", () => {
  it("flushes when the panel is no longer front", () => {
    const p = pending("/a", "draft");
    expect(planPanelChange(p, false).write).toBe(p);
  });

  it("does NOT flush while the panel is still front", () => {
    const p = pending("/a", "draft");
    const plan = planPanelChange(p, true);
    expect(plan.write).toBeNull();
    expect(plan.pending).toBe(p);
  });

  it("flushes at the SAME path the text was typed in", () => {
    // The panel-change flush is a flush like any other, so it inherits the
    // project-capture property — asserted here too rather than assumed, because this is a
    // separate entry point into the machine.
    expect(
      planPanelChange(pending("/typed-in", "t"), false).write?.projectPath,
    ).toBe("/typed-in");
  });

  it("is a safe no-op when nothing is pending", () => {
    expect(planPanelChange(null, false).write).toBeNull();
    expect(planPanelChange(null, true).pending).toBeNull();
  });
});

describe("the debounce window is a shared constant", () => {
  it("is exported so callers cannot re-type it", () => {
    // A caller hardcoding its own `400` would silently stop tracking this value.
    expect(DRAFT_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3.3 / P3.6 — the FUNNEL guards.
//
// ⚠️ These exist because extracting a pure state machine proves the MACHINE, not its
// CALLERS. Every test above proves `promptDraftSync` decides correctly; none of them would
// notice a component that ignored those decisions and called `saveDraft` itself. That
// exact shape has already shipped a CRITICAL in this project (M11 WP4, twice), so the
// funnel is asserted structurally.
describe("PromptPanel funnels every write through one call site", () => {
  it("calls saveDraft exactly ONCE in the whole component", () => {
    // ⚠️ Counted, not merely "contains". `toContain("saveDraft(")` passes for a component
    // with three scattered call sites — which is the precise regression this guards
    // (`[[raw-guard-substring-must-be-unique-to-its-site]]`). Comments are stripped first
    // because this file and the panel both DISCUSS `saveDraft`.
    const src = stripComments(panelSource);
    const calls = src.match(/\bsaveDraft\(/g) ?? [];
    expect(
      calls.length,
      "every draft write must go through runPlan — add an input to promptDraftSync " +
        "rather than a second saveDraft call",
    ).toBe(1);
  });

  // ⚠️ INVERTED AT F-a WP4 PHASE 2 — DELIBERATELY, NOT INCIDENTALLY.
  //
  // WP3 shipped a guard here named "does NOT open the WP4 send seam (P3.6)" asserting that
  // `stagedPayload` / `injectCommand` / `appendToHistory` / `cc_input` were ABSENT from the
  // panel. That was correct then: an untested seam nothing consumes is the thing it forbade.
  // WP4 opened the seam, so the guard had to change — and the choice was between DELETING it
  // and INVERTING it. Deleting would have traded a real invariant for nothing.
  //
  // ⚠️ The polarity trap this file now sits on: a `grep -c "injectCommand" → 0` outcome cannot
  // distinguish "the send is wired" from "a comment says do not wire it"
  // (`docs/lessons/source-text-guards.md`, entry 14). Comments are stripped before every
  // assertion below for exactly that reason, and the panel's own header DOES discuss the seam.
  it("DOES open the send seam, through the sanctioned modules (was P3.6, inverted at WP4)", () => {
    const src = stripComments(panelSource);
    for (const required of ["planSend", "injectCommand", "appendToHistory"]) {
      expect(
        src,
        `${required} is the WP4 send path — the panel must wire it`,
      ).toContain(required);
    }
  });

  it("reaches cc_input ONLY through injectCommand — no second path (F-a decision 2)", () => {
    // ⚠️ The decision this pins by name: "enters through `injectCommand` with `label:
    // \"staging\"` — do NOT open a second path to `cc_input`." A direct `invoke("cc_input")`
    // here would bypass the funnel's `.catch` and its label, re-opening the misattribution
    // defect M13 hit.
    const src = stripComments(panelSource);
    expect(src).not.toContain("cc_input");
    expect(src).not.toContain('invoke("');
  });

  it("calls injectCommand EXACTLY ONCE in the whole component", () => {
    // ⚠️ Counted, not merely "contains" — the same reasoning as the `saveDraft` funnel guard
    // above (`[[raw-guard-substring-must-be-unique-to-its-site]]`). FOUR triggers (two buttons,
    // two hotkeys) feed this send; the regression being guarded is one of them growing its own
    // injection rather than routing through `send(mode)`.
    const src = stripComments(panelSource);
    const calls = src.match(/\binjectCommand\(/g) ?? [];
    expect(
      calls.length,
      "every send must route through the single `send(mode)` funnel — add a mode, not a " +
        "second injectCommand call",
    ).toBe(1);
  });

  it("archives to the history ring BEFORE clearing the draft", () => {
    // ⚠️ AN ORDER ASSERTION, and it guards a real data-loss path rather than a style
    // preference: `appendToHistory` REFUSES a blank entry, so clearing first would hand it an
    // empty string and silently archive nothing — destroying the only copy of text that has
    // just left the panel. Positions are compared in comment-stripped source so the prose
    // above (which names both, in the other order) cannot satisfy it.
    const src = stripComments(panelSource);
    const append = src.indexOf("appendToHistory(");
    const clear = src.indexOf("clearDraft(");
    expect(append, "appendToHistory( not found").toBeGreaterThan(-1);
    expect(clear, "clearDraft( not found").toBeGreaterThan(-1);
    expect(
      append,
      "the archive must happen before the clear — appendToHistory refuses a blank entry",
    ).toBeLessThan(clear);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3.4 — the indicator chain is covered by a PARSED RENDER, not by source text.
//
// ⚠️ A `?raw` three-link guard used to live here and was DELETED at code review. It grepped
// PromptPanel and RightPanelHost for the literal expressions wiring the indicator, justifying
// that choice with "this project configures no DOM environment" — a premise
// `docs/lessons/source-text-guards.md` explicitly corrects ("HALF TRUE, and the discouraging
// half has been steering work toward the guard style that failed the nine ways above").
//
// It is replaced by `promptTabIndicatorRender.test.tsx`, which renders `RightPanelHost` and
// asserts the tab's resting DOM. That is strictly stronger, and not merely tidier: the render
// test FAILED ON ITS FIRST RUN and exposed a real defect the grep could never see — `hasDraft`
// started at `false`, so the first paint of a workspace with unsent work showed no dot. The
// source guard was green throughout, because every literal it matched was present and correct.
//
// The rule, from the lesson: when the question is "what does the DOM look like at rest",
// render it; when it is "what does the source say", guard the source. The two guards ABOVE
// are genuinely source questions — "is there exactly one `saveDraft` call site" and "is the
// WP4 send seam absent" are statements about the code, not about its output.

describe("every plan function has a live caller", () => {
  // ⚠️ THIS SUITE EXISTS BECAUSE A MUTANT SURVIVED, AND BECAUSE THE DEFECT SHIPPED ONCE.
  //
  // `planPanelChange` was exported, documented and tested from the start — and called by
  // NOTHING, so this module promised a flush-on-tab-away that the panel never performed. Code
  // review caught it. After wiring it, deleting the call site again was mutation-tested: all
  // 44 tests still passed. The pure-function tests cannot see an unwired plan, by
  // construction — they call it themselves.
  //
  // ⚠️ A source guard is the honest instrument here, NOT a render test: a server render cannot
  // transition `panelFront`, so "does leaving the tab flush?" is unreachable in jsdom. The
  // question this asserts is genuinely about the source ("is the function invoked?"), which is
  // the side of `source-text-guards.md`'s rule that guards belong on.
  const PLAN_FUNCTIONS = [
    "planEdit",
    "planFlush",
    "planProjectSwitch",
    "planPanelChange",
  ] as const;

  it.each(PLAN_FUNCTIONS)("%s is invoked by PromptPanel", (fn) => {
    // Comment-stripped, and matched as a CALL (`name(`) rather than a bare identifier — an
    // import line or a prose mention would otherwise satisfy this exactly when the call was
    // deleted (`[[raw-guard-identifier-satisfied-by-own-comments]]`).
    const src = stripComments(panelSource);
    expect(
      src,
      `${fn} is exported and tested but never called — either wire it into PromptPanel or ` +
        `delete it; an unwired plan function makes the funnel look more complete than it is`,
    ).toContain(`${fn}(`);
  });

  it("the list above covers every plan function the module exports", () => {
    // ⚠️ Non-vacuity + the entry-16 sweep: a guard over a hardcoded list silently stops
    // covering the NEXT plan function someone adds, which is precisely how the first one went
    // unwired. Derived from the module's own source so adding an unlisted `plan*` export fails
    // here rather than passing unnoticed.
    const exported = [
      ...stripComments(syncSource).matchAll(/export function (plan\w+)/g),
    ].map((m) => m[1]);

    expect(exported.length, "no plan functions found — guard is vacuous").toBe(
      PLAN_FUNCTIONS.length,
    );
    expect([...exported].sort()).toEqual([...PLAN_FUNCTIONS].sort());
  });
});
