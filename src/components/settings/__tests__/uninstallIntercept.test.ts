// M10.9 WP3.5b task P3.4 — the gate-interception decision and the intent→outcome table.
//
// Both are asserted as VALUES. These are the two branches that decide whether a destructive
// dialog opens and whether the setting is written at all, which is exactly the shape the repo
// rule (root `CLAUDE.md`) says must be a pure function asserted as a value rather than a
// `?raw` source guard — WP2 paid for that twice, WP3.5a's Phase 2 once more.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  cancelMentionsGate,
  gateToggleAction,
  offersKeepIntent,
  outcomeForIntent,
  type UninstallIntent,
} from "../uninstallIntercept";
import type { InstallProvenance } from "../WorkflowSubstrateInfo";

describe("gateToggleAction — the dialog's trigger is PROVENANCE, not the toggle", () => {
  it("intercepts only when disabling a managed substrate", () => {
    expect(gateToggleAction(false, "managed")).toBe("open-uninstall-dialog");
  });

  it("never intercepts a developer install — Claudesk must not offer to remove it", () => {
    // THE load-bearing case, and the same one the refuse-guard protects in Rust. The
    // operator's ~/.claude/skills/ symlinks point into a repo they actively edit; Claudesk
    // holds no record of installing it, so turning the gate off is JUST a setting change.
    // Offering removal here would be offering to delete their live workflow system.
    expect(gateToggleAction(false, "developer")).toBe("persist");
  });

  it("never intercepts when nothing is installed", () => {
    expect(gateToggleAction(false, "absent")).toBe("persist");
  });

  it("never intercepts while provenance is unresolved", () => {
    // A `null` read is "we don't know yet" — and a destructive dialog is not something to
    // open on a guess. Persisting is the safe direction: the setting changes, the substrate
    // is untouched.
    expect(gateToggleAction(false, null)).toBe("persist");
  });

  it("never intercepts on ENABLE, whatever the provenance", () => {
    // Installing and enabling are separate acts (milestone property 2). Turning the feature
    // layer ON never triggers substrate work in either direction.
    const states: InstallProvenance[] = [
      "managed",
      "developer",
      "absent",
      null,
    ];
    for (const state of states) {
      expect(gateToggleAction(true, state), `enabling with ${state}`).toBe(
        "persist",
      );
    }
  });
});

describe("outcomeForIntent — keep and cancel differ ONLY in the gate", () => {
  it("uninstall removes the substrate and turns the gate off", () => {
    expect(outcomeForIntent("uninstall")).toEqual({
      runsUninstall: true,
      persistGate: false,
    });
  });

  it("keep leaves the substrate and turns the gate off", () => {
    expect(outcomeForIntent("keep")).toEqual({
      runsUninstall: false,
      persistGate: false,
    });
  });

  it("cancel leaves the substrate and writes NOTHING", () => {
    // `persistGate: null` — not `true`. This is the structural revert: the gate was never
    // written, so there is nothing to undo. A `true` here would mean the code wrote `false`
    // and then wrote `true` back, leaving a window where a crash strands the user in keep's
    // state without having chosen it.
    expect(outcomeForIntent("cancel")).toEqual({
      runsUninstall: false,
      persistGate: null,
    });
  });

  it("cancel is the ONLY intent that writes nothing", () => {
    const intents: UninstallIntent[] = ["uninstall", "keep", "cancel"];
    const writesNothing = intents.filter(
      (i) => outcomeForIntent(i).persistGate === null,
    );
    expect(writesNothing).toEqual(["cancel"]);
  });

  it("uninstall is the ONLY intent that runs the removal", () => {
    const intents: UninstallIntent[] = ["uninstall", "keep", "cancel"];
    const runs = intents.filter((i) => outcomeForIntent(i).runsUninstall);
    expect(runs).toEqual(["uninstall"]);
  });

  it("keep and cancel agree on the substrate and disagree on the gate", () => {
    // The distinction that justifies three buttons instead of two, asserted directly rather
    // than left implicit across two separate test cases.
    const keep = outcomeForIntent("keep");
    const cancel = outcomeForIntent("cancel");
    expect(keep.runsUninstall).toBe(cancel.runsUninstall);
    expect(keep.persistGate).not.toBe(cancel.persistGate);
  });
});

describe("the two entry points (operator, 2026-07-31: BOTH are supported)", () => {
  // The substrate row now carries an [Uninstall & disable…] button — the visible pair of
  // [Install…] — AND the gate toggle still intercepts. One dialog, two arrivals, and they are
  // NOT interchangeable: `[Cancel]` means "undo what brought me here", which differs per path.

  it("offers [Keep it installed] only on the toggle path", () => {
    // From the toggle, "turn the features off but leave the substrate" is a coherent third
    // answer — it is exactly what the user asked for, minus the removal.
    expect(offersKeepIntent("toggle")).toBe(true);
  });

  it("does NOT offer [Keep it installed] from the uninstall button", () => {
    // Arriving via a button labelled "Uninstall & disable", the user never asked to disable
    // anything on its own. Offering "disable without uninstalling" would invent an intent they
    // did not express — and would make the two non-destructive buttons nearly synonymous.
    expect(offersKeepIntent("button")).toBe(false);
  });

  it("cancel mentions the gate only on the toggle path", () => {
    // Cancel says "nothing changes" either way; only the toggle path has a PENDING change to
    // reassure about. Routed through a predicate rather than an inline `trigger === "toggle"`
    // at the call site — trigger-dependent decisions live in this module, where they are
    // asserted as values (code review, 2026-07-31).
    expect(cancelMentionsGate("toggle")).toBe(true);
    expect(cancelMentionsGate("button")).toBe(false);
  });

  it("cancel writes nothing on EITHER path — the revert stays structural", () => {
    // The trigger changes which buttons appear, never what an intent means. Cancel is
    // no-write on both paths: from the toggle that leaves the gate ON (nothing was written),
    // from the button there was nothing to write in the first place.
    expect(outcomeForIntent("cancel").persistGate).toBeNull();
  });

  it("confirming turns the gate off regardless of how the dialog was opened", () => {
    // From the toggle because that is what the user asked for; from the button because
    // "& disable" is half its label. Trigger-independent, which is why there is no
    // `confirmDisablesGate(trigger)` helper — it would return a constant.
    expect(outcomeForIntent("uninstall").persistGate).toBe(false);
  });
});

describe("the panel consumes the decision rather than re-deriving it", () => {
  // The value tests above pin the DECISION; this pins its CONSUMPTION. A panel that branched
  // inline would leave every assertion above true while the real toggle did something else.
  // Comment-stripped (a guard reading raw source matches its own prose) and identifier-level
  // (never a formatted multi-line expression).
  const PANEL = readFileSync(
    fileURLToPath(new URL("../SettingsPanel.tsx", import.meta.url)),
    "utf8",
  )
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("routes the checkbox through the interception handler", () => {
    expect(PANEL).toContain("onGateToggle(e.target.checked)");
  });

  it("asks the pure decision instead of testing provenance inline", () => {
    expect(PANEL).toContain("gateToggleAction(nextValue, provenance)");
  });

  it("applies intents through the shared outcome table", () => {
    expect(PANEL).toContain("outcomeForIntent(intent)");
  });

  it("offers the uninstall button ONLY for a managed substrate", () => {
    // The provenance rule at the affordance layer: `developer` (the operator's live repo, a
    // hand-clone, or a damaged record) must never be offered removal, and `absent` has nothing
    // to remove. Mirrors `offersInstallWizard`'s absent-only rule in the other direction.
    expect(PANEL).toContain('provenance === "managed" ? (');
    expect(PANEL).toContain('data-testid="substrate-uninstall-button"');
  });

  it("records WHICH entry point opened the dialog", () => {
    // Passed explicitly, never inferred — two arrivals into one destructive dialog
    // distinguishable only by invisible state is the inferred-mode failure this project has
    // hit before.
    expect(PANEL).toContain('setUninstallTrigger("button")');
    expect(PANEL).toContain('setUninstallTrigger("toggle")');
    expect(PANEL).toContain("trigger={uninstallTrigger}");
  });

  it("skips the gate write when the outcome says to write nothing", () => {
    // The cancel path, as code: a null check guarding the set. Without it, `set(null)` would
    // be a type error — but a refactor to `set(outcome.persistGate ?? true)` would compile and
    // silently reintroduce the write-then-revert window this design removes.
    expect(PANEL).toContain("outcome.persistGate !== null");
  });
});
