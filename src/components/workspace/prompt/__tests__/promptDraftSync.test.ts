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
import hostSource from "../../RightPanelHost.tsx?raw";

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
  it("flushes when moving to another panel", () => {
    const p = pending("/a", "draft");
    expect(planPanelChange(p, "editor").write).toBe(p);
  });

  it("does NOT flush while staying on the prompt panel", () => {
    const p = pending("/a", "draft");
    const plan = planPanelChange(p, "prompt");
    expect(plan.write).toBeNull();
    expect(plan.pending).toBe(p);
  });

  it("flushes to EVERY non-prompt panel, not just the editor", () => {
    // ⚠️ A mutation hunt finds AN instance, never the class (source-text-guards entry 16).
    // Enumerating the siblings here means a future `nextPanel === "editor"` shortcut fails
    // rather than passing on the one arm someone happened to test.
    const p = pending("/a", "draft");
    for (const panel of ["editor", "diff", "terminal", "docs"] as const) {
      expect(
        planPanelChange(p, panel).write,
        `leaving prompt for "${panel}" must flush`,
      ).toBe(p);
    }
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
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

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

  it("does NOT open the WP4 send seam (P3.6)", () => {
    // Sending is WP4's. An untested seam nothing consumes is the thing this check forbids,
    // and it also keeps "the draft did not send" unambiguous between the buffer and the
    // payload if WP4 later misbehaves.
    const src = stripComments(panelSource);
    for (const forbidden of [
      "stagedPayload",
      "injectCommand",
      "appendToHistory",
      "cc_input",
    ]) {
      expect(
        src,
        `${forbidden} belongs to WP4 — Phase 3 must not wire the send path`,
      ).not.toContain(forbidden);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3.4 verify-codify — the tab-indicator wiring, which SPANS TWO FILES.
//
// ⚠️ Why this needs a guard at all: the indicator is a three-link chain — PromptPanel
// reports presence from inside its write funnel → RightPanelHost holds it in state → the
// Prompt tab renders `data-has-draft`. Break ANY link and the dot silently stops appearing,
// which is a failure the operator only notices by its absence. Nothing else in the suite
// crosses that boundary: the panel's own tests never render, and the host's ?raw guards
// never look at the panel.
//
// ⚠️ This is a structural guard because the behaviour is React-render-level and this project
// has no DOM environment. The LIVE assertion — three tabs, two states, one render, with the
// `::after` dot's computed content checked — is the Phase 3 verify-self outcome. This exists
// so a link cannot be quietly cut between verify runs.
describe("the draft-presence indicator is wired end to end", () => {
  it("PromptPanel reports presence from INSIDE the write funnel", () => {
    const src = stripComments(panelSource);
    // The report must sit in `runPlan` next to the `saveDraft` call, not in a render path:
    // reporting from render would describe the BUFFER, while the indicator's contract is
    // about STORAGE (it must be correct for a panel nobody is looking at).
    expect(src).toContain('presenceRef.current?.(plan.write.text !== "")');
  });

  it("PromptPanel also reports the SEEDED presence, not only on edit", () => {
    // Without a mount-time report the dot would stay dark for a project that already has a
    // stored draft until the operator typed — wrong in exactly the case it exists for
    // (returning to unsent work). Two sites: mount, and the project-switch effect.
    const src = stripComments(panelSource);
    const reports = src.match(/presenceRef\.current\?\.\(/g) ?? [];
    expect(
      reports.length,
      "expected three presence reports: the funnel, the mount seed, and the project switch",
    ).toBe(3);
  });

  it("RightPanelHost consumes the callback and renders the attribute", () => {
    const host = stripComments(hostSource);
    // Link 2: the host passes its setter in…
    expect(host).toContain("onDraftPresenceChange={setHasDraft}");
    // …and link 3: the tab renders the state as a testable attribute, not only a class.
    expect(host).toContain("data-has-draft=");
    // ⚠️ Asserted as a TEMPLATE over the state, not a bare literal — `data-has-draft="true"`
    // hardcoded would satisfy a substring check while making the indicator a constant,
    // which is precisely the bug the live negative control was built to catch.
    expect(host).toContain('data-has-draft={hasDraft ? "true" : "false"}');
  });
});
