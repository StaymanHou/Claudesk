// M10.9 WP3.5a Phase 4 — the install affordance's decision + its consent copy.
//
// Both are asserted as VALUES. The repo rule (root `CLAUDE.md`) is that `?raw` source guards
// verify structure, never runtime, and silently stop matching after a formatter reflow — WP2 paid
// for that twice, and Phase 2 of this very WP paid for it again with a source-position guard that
// passed broken code. So the affordance decision lives in a pure function and the copy lives in
// exported constants, and this file compares them to expected values.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  offersInstallWizard,
  substrateArmFor,
  type InstallProvenance,
} from "../WorkflowSubstrateInfo";
import {
  CONSENT_ITEMS,
  CONSENT_GLOBAL_CLAUDE_MD,
  CONSENT_PERMISSIONS_MANUAL,
  CONSENT_DIRECTORIES,
  CONSENT_REVERSIBLE,
  CANCELLING_LABEL,
  CANCELLING_HINT,
} from "../workflowInstallCopy";

describe("offersInstallWizard — the safety boundary, not a UX nicety", () => {
  it("offers the wizard ONLY for an absent substrate", () => {
    expect(offersInstallWizard("absent")).toBe(true);
  });

  it("never offers it for a developer install — the operator's live repo", () => {
    // THE load-bearing case. The operator's ~/.claude/skills/ symlinks point into a companion
    // repo they actively edit. Claudesk did not record installing it, so per the provenance rule
    // it must describe, never act — running install.sh here could repoint those symlinks into a
    // different tree.
    expect(offersInstallWizard("developer")).toBe(false);
  });

  it("never offers it for a substrate we already installed", () => {
    expect(offersInstallWizard("managed")).toBe(false);
  });

  it("shows nothing while provenance is unresolved", () => {
    // Resolve before claiming. The wrong default here offers to install over a live repo, so
    // `null` must be silent rather than optimistic — same discipline as `substrateArmFor(null)`
    // and the gate seam's pre-seed `false`.
    expect(offersInstallWizard(null)).toBe(false);
  });

  it("is exhaustive over the provenance type", () => {
    // Guards against a fourth state being added without a decision here. If someone extends
    // `InstallProvenance`, this array stops type-checking and they are forced to choose.
    const all: Exclude<InstallProvenance, null>[] = [
      "absent",
      "managed",
      "developer",
    ];
    const offered = all.filter((s) => offersInstallWizard(s));
    expect(offered).toEqual(["absent"]);
  });

  it("does not disturb WP3's presence-based arm decision", () => {
    // Provenance is a NEW axis, not a replacement: the install/absent/nothing arms still drive
    // what text renders. A regression here would mean the two questions got conflated.
    expect(substrateArmFor(null)).toBe("nothing");
    expect(substrateArmFor(true)).toBe("installed");
    expect(substrateArmFor(false)).toBe("absent");
  });
});

describe("consent copy — every side effect of the real install.sh", () => {
  it("discloses the GLOBAL CLAUDE.md edit and its backup", () => {
    // The scope surprise (install.sh:102-171): the user consented to "install a workflow
    // system", not to an edit of the file that shapes every Claude Code session they run.
    // Naming it is what makes the consent informed rather than nominal.
    expect(CONSENT_GLOBAL_CLAUDE_MD).toContain("~/.claude/CLAUDE.md");
    expect(CONSENT_GLOBAL_CLAUDE_MD).toContain("CLAUDE.md.bak");
  });

  it("says the permission entries are printed but NOT applied", () => {
    // install.sh:176-181 prints four entries and applies none. Claiming it "adds permissions"
    // would be false; omitting it leaves a half-working install with no explanation.
    expect(CONSENT_PERMISSIONS_MANUAL).toMatch(/NOT apply|does NOT/);
    expect(CONSENT_PERMISSIONS_MANUAL).toContain("settings.json");
  });

  it("states the hooks directory CONDITIONALLY and never promises bin/", () => {
    // `~/.claude/bin/` is never created (the claude-time linking that made it was retired
    // upstream 2026-07-29). `~/.claude/hooks/` is created only if the repo ships hooks —
    // install.sh:67-68 is live-but-dormant. A fixed list would go stale the moment upstream
    // adds one, which is why the copy states the condition instead of enumerating.
    expect(CONSENT_DIRECTORIES).toContain("only if");
    expect(CONSENT_DIRECTORIES).not.toContain("bin/");
  });

  it("names the back-out path", () => {
    // uninstall.sh is standalone and idempotent, so "one command undoes it" is a claim the
    // script actually backs. Claudesk's own uninstall wizard is WP3.5b; until then this IS the
    // reversibility story, so it must be stated rather than implied.
    expect(CONSENT_REVERSIBLE).toContain("uninstall.sh");
  });

  it("renders every disclosure, with no duplicates", () => {
    expect(CONSENT_ITEMS).toContain(CONSENT_GLOBAL_CLAUDE_MD);
    expect(CONSENT_ITEMS).toContain(CONSENT_PERMISSIONS_MANUAL);
    expect(new Set(CONSENT_ITEMS).size).toBe(CONSENT_ITEMS.length);
  });

  it("never promises a quick or 5-minute anything", () => {
    // The upstream-pinned honest-framing invariant (return contract §6): the tour is a real
    // ~10–15 min run. This copy is adjacent to it, so the same prohibition applies.
    for (const item of CONSENT_ITEMS) {
      expect(item).not.toMatch(/\b5[- ]minute\b|\bquick\b/i);
    }
  });
});

describe("cancel copy — honest about coarse cancellation", () => {
  it("says cancelling, not cancelled", () => {
    // The flag is polled BETWEEN steps, never mid-subprocess (killing git halfway corrupts the
    // object store), so a cancel during a long clone is honored only when the clone finishes.
    // A label claiming the work stopped would be a lie at the moment the user watches hardest.
    expect(CANCELLING_LABEL).toBe("Cancelling…");
    expect(CANCELLING_LABEL).not.toMatch(/cancelled/i);
  });

  it("explains WHY the delay happens", () => {
    expect(CANCELLING_HINT).toMatch(/current step|corrupt/i);
  });
});

describe("post-install refresh — the stale-status bug found at verify-human", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // The defect: after a SUCCESSFUL install the row still read "not installed".
  //
  // Cause: two independent state sources. `provenance` drives the [Install…]
  // affordance; `substratePresent` drives the "installed ✓ / not installed" line.
  // `onFinished` refreshed only the first, so the button correctly disappeared
  // while the status line stayed at its mount-time value — violating the spec
  // criterion that the block re-resolves to `managed` without a relaunch.
  //
  // Guarded at source level because this repo has no DOM test environment for the
  // panel (pure logic → vitest, live DOM → the MCP bridge). Asserts single
  // identifiers inside one handler body, per the repo rule about `?raw` guards —
  // never a formatted multi-line expression.
  // ═══════════════════════════════════════════════════════════════════════════
  const PANEL = readFileSync(
    fileURLToPath(new URL("../SettingsPanel.tsx", import.meta.url)),
    "utf8",
  );

  /** The `onFinished` handler body — the one place both refreshes must appear. */
  function onFinishedBody(): string {
    const at = PANEL.indexOf("onFinished={(result)");
    if (at === -1) return "";
    // Bounded by the next prop on the same element.
    const end = PANEL.indexOf("onEnableAndClose", at);
    return PANEL.slice(at, end === -1 ? at + 1200 : end);
  }

  it("refreshes BOTH substrate state sources after an install", () => {
    const body = onFinishedBody();
    expect(body, "the onFinished handler must exist").not.toBe("");
    expect(
      body,
      "provenance drives the [Install…] affordance — must be re-resolved",
    ).toContain("refreshProvenance");
    expect(
      body,
      'substratePresent drives the "installed ✓ / not installed" line — must be ' +
        "re-resolved too, or the row contradicts the button (the shipped bug)",
    ).toContain("refreshSubstratePresent");
  });

  it("exposes the presence read as a reusable callback, not a mount-only effect", () => {
    // WP3 only needed this at mount (a directory does not appear on its own). The wizard makes
    // it appear, so the read has to be callable again — if this collapses back into an
    // effect-only read, the refresh above has nothing to call.
    expect(PANEL).toContain("const refreshSubstratePresent = useCallback");
  });

  it("offers enable-and-close only as a distinct, explicit action", () => {
    // Installing and enabling stay separate acts (milestone property 2), so the plain Close
    // path must survive alongside it — a user who installed to try later must not have the
    // gate flipped for them.
    const WIZARD = readFileSync(
      fileURLToPath(new URL("../WorkflowInstallWizard.tsx", import.meta.url)),
      "utf8",
    );
    expect(WIZARD).toContain('data-testid="install-close"');
    expect(WIZARD).toContain('data-testid="install-enable-close"');
    // And the enable button is gated on success — offering it after a failure would enable a
    // gate whose substrate is not there.
    expect(WIZARD).toContain("{result.ok && (");
  });
});

describe("install-affordance POSITION — under the status line, above the manual steps", () => {
  // The position is the requirement, not decoration (operator, verify-human 2026-07-30).
  //
  // First attempt rendered the button as a sibling BEFORE the substrate block, which put it
  // above the very "Workflow system: not installed" line that explains why a user would want
  // it — an action floating free of its own justification. The fix passes it INTO the block as
  // a slot so the reading order is: what state am I in → the button that changes it → the
  // manual fallback.
  //
  // Source-level (no DOM env for this component), but asserting ORDER via index comparison
  // rather than presence — which is what the requirement actually is.
  const INFO = readFileSync(
    fileURLToPath(new URL("../WorkflowSubstrateInfo.tsx", import.meta.url)),
    "utf8",
  );
  const PANEL_SRC = readFileSync(
    fileURLToPath(new URL("../SettingsPanel.tsx", import.meta.url)),
    "utf8",
  );

  /** Just the `absent` arm's JSX — the only arm that renders the install action. */
  function absentArm(): string {
    const at = INFO.indexOf('data-testid="substrate-info-absent"');
    if (at === -1) return "";
    const end = INFO.indexOf("if (arm ===", at + 10);
    return INFO.slice(at, end === -1 ? INFO.length : end);
  }

  it("renders the install action AFTER the not-installed status line", () => {
    const arm = absentArm();
    expect(arm, "the absent arm must exist").not.toBe("");
    const status = arm.indexOf("not installed");
    const action = arm.indexOf("{installAction}");
    expect(status, "status line must be present").toBeGreaterThan(-1);
    expect(
      action,
      "the install slot must render in the absent arm",
    ).toBeGreaterThan(-1);
    expect(
      action,
      "the button must come AFTER the status line — above it, the action explains nothing",
    ).toBeGreaterThan(status);
  });

  it("renders the install action BEFORE the manual-steps disclosure", () => {
    const arm = absentArm();
    const action = arm.indexOf("{installAction}");
    const manual = arm.indexOf("substrate-install-disclosure");
    expect(
      manual,
      "the manual-steps disclosure must be present",
    ).toBeGreaterThan(-1);
    expect(
      action,
      "the wizard is the PRIMARY path — it must precede the manual fallback, or the " +
        "instructions read as the expected route",
    ).toBeLessThan(manual);
  });

  it("renders the OPEN WIZARD in the same slot, not as a sibling", () => {
    // The second correction. Slotting the button but leaving the wizard as a sibling meant
    // opening it made the panel jump — the wizard appeared below the manual steps, detached
    // from the button that summoned it. The affordance and its expanded form must occupy the
    // same position.
    //
    // Asserted by position: the wizard element must appear INSIDE the installAction prop,
    // which is bounded by the <WorkflowSubstrateInfo ... /> element.
    // Count-based, NOT index-based. An index comparison scans forward and happily finds the
    // real slotted wizard even when a stray sibling exists earlier — I proved that by mutation:
    // inserting a sibling <WorkflowInstallWizard /> before the block left the index form
    // PASSING. So assert there is exactly ONE render of the wizard and that it lives inside the
    // slot's bounds.
    const renders = PANEL_SRC.match(/<WorkflowInstallWizard\b/g) ?? [];
    expect(
      renders.length,
      "the wizard must be rendered exactly ONCE — a second render site means one of them is " +
        "a detached sibling",
    ).toBe(1);

    const infoAt = PANEL_SRC.indexOf("<WorkflowSubstrateInfo");
    const slotAt = PANEL_SRC.indexOf("installAction={", infoAt);
    const wizardAt = PANEL_SRC.indexOf("<WorkflowInstallWizard");
    expect(slotAt, "the slot must exist").toBeGreaterThan(-1);
    expect(
      wizardAt,
      "the wizard must render INSIDE installAction — as a sibling it detaches from the " +
        "button position and the panel jumps when it opens",
    ).toBeGreaterThan(slotAt);
  });

  it("passes the button through the slot rather than rendering it as a sibling", () => {
    // The sibling form is the shipped mistake. If someone re-adds a standalone
    // <button className="substrate-install-button"> outside the slot, the position guarantee
    // silently breaks while both assertions above still pass.
    expect(PANEL_SRC).toContain("installAction={");
    const infoAt = PANEL_SRC.indexOf("<WorkflowSubstrateInfo");
    const buttonAt = PANEL_SRC.indexOf('className="substrate-install-button"');
    expect(buttonAt).toBeGreaterThan(infoAt);
  });
});

describe("reveal-on-open — the wizard must not open half-clipped", () => {
  // The wizard is tall and opens partway down a scrollable panel, so it appeared with its
  // bottom half — including the Install and Cancel buttons — below the fold. The user then had
  // to hunt for the scrollbar to reach the primary action of the thing they just opened.
  const WIZ = readFileSync(
    fileURLToPath(new URL("../WorkflowInstallWizard.tsx", import.meta.url)),
    "utf8",
  );

  /**
   * The wizard's source with comments stripped.
   *
   * ⚠️ Required, not tidiness. My first version of these guards asserted against the raw file,
   * and a mutation that DELETED the `scrollIntoView` call still passed — the word survived in
   * the doc comment right above it. That is the third time this session a guard matched prose
   * instead of code. Strip comments first, always.
   */
  const WIZ_CODE = WIZ.split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("scrolls itself into view on mount", () => {
    expect(WIZ_CODE).toContain("scrollIntoView");
  });

  it('uses block: "nearest" — the minimum scroll, and a no-op when already visible', () => {
    // NOT "start"/"center": those yank the wizard to the top of the viewport even when it is
    // already fully visible, throwing away the surrounding context (the "not installed" status
    // line the button sat under) for no reason. "nearest" scrolls only as far as needed.
    expect(WIZ_CODE).toContain('block: "nearest"');
    expect(WIZ_CODE).not.toContain('block: "start"');
    expect(WIZ_CODE).not.toContain('block: "center"');
  });

  it("attaches the reveal to the wizard ROOT, not an inner element", () => {
    // Revealing an inner node (the actions row, say) would scroll that into view while leaving
    // the wizard's header clipped above — the mirror image of the bug.
    const rootAt = WIZ.indexOf('className="install-wizard"');
    const refAt = WIZ.indexOf("ref={revealRef}");
    expect(rootAt).toBeGreaterThan(-1);
    expect(refAt).toBeGreaterThan(-1);
    // The ref must be on the same element as the root class (within its attribute list).
    expect(Math.abs(refAt - rootAt)).toBeLessThan(160);
  });
});
