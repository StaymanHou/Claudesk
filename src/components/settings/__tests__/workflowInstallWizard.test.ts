// M10.9 WP3.5a Phase 4 — the install affordance's decision + its consent copy.
//
// Both are asserted as VALUES. The repo rule (root `CLAUDE.md`) is that `?raw` source guards
// verify structure, never runtime, and silently stop matching after a formatter reflow — WP2 paid
// for that twice, and Phase 2 of this very WP paid for it again with a source-position guard that
// passed broken code. So the affordance decision lives in a pure function and the copy lives in
// exported constants, and this file compares them to expected values.

import { describe, it, expect } from "vitest";
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
