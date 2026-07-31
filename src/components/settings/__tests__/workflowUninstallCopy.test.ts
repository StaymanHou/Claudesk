// M10.9 WP3.5b task P3.4 — the uninstall dialog's copy + provenance legibility.
//
// Copy as VALUES, wiring as comment-stripped identifier checks. Same discipline as the install
// side: this repo has no DOM test environment (pure logic → vitest, live DOM → the MCP bridge),
// so anything a test must pin is an exported constant the component interpolates.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CANCEL_HINT_BUTTON,
  CANCEL_HINT_TOGGLE,
  KEEP_HINT,
  UNINSTALL_EFFECTS,
  UNINSTALL_INTRO,
  UNINSTALL_NOT_REMOVED,
  UNINSTALL_BUTTON_LABEL,
  UNINSTALL_PREVIEW_HINT,
  UNINSTALL_STALE_RECORD_HINT,
} from "../workflowUninstallCopy";
import { PROVENANCE_COPY, provenanceCopyFor } from "../WorkflowSubstrateInfo";

describe("provenanceCopyFor — the legibility gap the operator hit", () => {
  // SURFACE-2026-07-30-WP3.5A-PROVENANCE-STATE-NOT-LEGIBLE-IN-UI: the row showed only
  // `installed ✓` / `not installed`, so a `developer` user saw no affordances and no
  // explanation. Every "developer" string in this directory was a CODE COMMENT.

  it("names a sentence for each of the three resolved states", () => {
    expect(provenanceCopyFor("absent")).toBe(PROVENANCE_COPY.absent);
    expect(provenanceCopyFor("managed")).toBe(PROVENANCE_COPY.managed);
    expect(provenanceCopyFor("developer")).toBe(PROVENANCE_COPY.developer);
  });

  it("renders nothing while unresolved", () => {
    // Same discipline as `substrateArmFor(null)`: resolve before committing to a claim.
    expect(provenanceCopyFor(null)).toBeNull();
  });

  it("tells a developer-install user WHY there is no button", () => {
    // The actual complaint. The copy must state both halves: that Claudesk has no record,
    // and that it therefore will not act.
    const copy = PROVENANCE_COPY.developer;
    expect(copy).toContain("no record");
    expect(copy).toMatch(/won't (modify or remove|remove)/);
  });

  it("tells a managed user that Claudesk CAN remove it", () => {
    // Superseded 2026-07-31 (operator, verify-human). This used to assert the copy named the
    // route ("turn off Workflow features above") because the uninstall was toggle-triggered
    // only — which left the managed row with a SENTENCE where the absent row had a BUTTON.
    // The operator read the panel twice and asked where the wizard was; that is the affordance
    // failing, not the reader. There is now an [Uninstall & disable…] button in the row, so
    // the copy states provenance and lets the button be the affordance.
    expect(PROVENANCE_COPY.managed).toMatch(/Installed by Claudesk/i);
    expect(PROVENANCE_COPY.managed).toMatch(/can remove it/i);
    // And it must NOT send the reader hunting for a checkbox anymore.
    expect(PROVENANCE_COPY.managed).not.toMatch(/turn off Workflow features/i);
  });

  it("labels the uninstall button with BOTH of its effects", () => {
    // It removes the substrate AND turns the gate off. Naming only the removal would make the
    // gate change a surprise; the label is the only place that promise is made.
    expect(UNINSTALL_BUTTON_LABEL).toMatch(/uninstall/i);
    expect(UNINSTALL_BUTTON_LABEL).toMatch(/disable/i);
    // Ellipsis: it opens a confirmation, it does not act immediately — same convention as
    // the install button.
    expect(UNINSTALL_BUTTON_LABEL).toMatch(/…$/);
  });

  it("states a CONDITION for developer, never a guessed cause", () => {
    // `developer` covers three different situations (live repo / hand-clone / damaged
    // record). Naming any one of them would be wrong two-thirds of the time.
    const copy = PROVENANCE_COPY.developer.toLowerCase();
    for (const guess of ["your repo", "hand-clone", "corrupt", "damaged"]) {
      expect(copy, `must not guess at the cause ("${guess}")`).not.toContain(
        guess,
      );
    }
  });

  it("the three sentences are distinct", () => {
    const all = Object.values(PROVENANCE_COPY);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("uninstall copy — the disclosure obligation", () => {
  it("discloses the CLAUDE.md block removal and its backup", () => {
    const joined = UNINSTALL_EFFECTS.join(" ");
    expect(joined).toContain("CLAUDE.md");
    expect(joined).toMatch(/back(ing)? (the file )?up/i);
  });

  it("discloses that Claudesk deletes its own record, not just the script's work", () => {
    // The act `uninstall.sh` does NOT perform — found by hand-running the real script
    // (SURFACE-2026-07-30-WP3.5B-UNINSTALL-MUST-CLEAR-THE-PROVENANCE-RECORD). If the copy
    // omitted it, the user would not know Claudesk touches anything of its own.
    const joined = UNINSTALL_EFFECTS.join(" ");
    expect(joined).toMatch(/record/i);
    expect(joined).toMatch(/downloaded|copy Claudesk/i);
  });

  it("discloses that foreign links are SKIPPED — the reassurance, not a detail", () => {
    const joined = UNINSTALL_EFFECTS.join(" ");
    expect(joined).toMatch(/did not create|untouched|skip/i);
  });

  it("says the skills/agents folders survive — and that the user's OWN skills survive with them", () => {
    // The user WILL see those folders afterwards. That is correct behavior (Claude Code owns
    // them; neither the script nor Claudesk may remove them), but silence makes it look like a
    // botched uninstall. Operator's call: state it plainly rather than policing the directory.
    //
    // The "empty" claim must stay CONDITIONAL. A first draft said the folders are left
    // "empty" flat out — false for anyone who had their own skills there, which is precisely
    // the user this WP's detection bug was about. Caught by driving the live flow with a
    // user-owned skill staged in the sandbox.
    const joined = UNINSTALL_EFFECTS.join(" ");
    expect(joined).toContain("~/.claude/skills/");
    expect(joined).toMatch(/Claude Code owns/i);
    expect(joined).toMatch(/skills of your own/i);
    expect(joined).toMatch(/if they end up empty/i);
    // The unconditional phrasing must not come back.
    expect(joined).not.toMatch(/in place, empty\./i);
  });

  it("states what uninstall does NOT remove — the settings.json symmetry", () => {
    // install.sh prints-but-never-applies the permissions; uninstall.sh prints-but-never-
    // removes them. Silence here would leave the user believing the removal was complete.
    expect(UNINSTALL_NOT_REMOVED).toContain("settings.json");
    expect(UNINSTALL_NOT_REMOVED).toMatch(/does not edit|stay until you/i);
  });

  it("says the features go off regardless of which button is chosen", () => {
    expect(UNINSTALL_INTRO).toMatch(/turned off/i);
  });

  it("distinguishes keep from cancel in words, not just in behavior", () => {
    // The two buttons differ ONLY in the gate, which is invisible from the labels. If these
    // hints ever collapse into the same sentence, the three-button design loses its point.
    expect(KEEP_HINT).not.toBe(CANCEL_HINT_TOGGLE);
    expect(KEEP_HINT).toMatch(/off/i);
    expect(CANCEL_HINT_TOGGLE).toMatch(/nothing|stay on/i);
    // Per-trigger since code review: the button path never proposed disabling anything, so
    // naming the gate there would answer a question the user did not ask.
    expect(CANCEL_HINT_BUTTON).toMatch(/nothing/i);
    expect(CANCEL_HINT_BUTTON).not.toMatch(/features/i);
  });

  it("attributes the preview to the script itself", () => {
    // The guarantee (preview and action cannot disagree) is only legible if the user knows
    // the list came from the same script that does the work.
    expect(UNINSTALL_PREVIEW_HINT).toMatch(/uninstall script|preview mode/i);
    expect(UNINSTALL_PREVIEW_HINT).toMatch(/nothing has been changed/i);
  });

  it("has copy for the stale-record arm — the one case a kept record is a problem", () => {
    expect(UNINSTALL_STALE_RECORD_HINT).toMatch(/could not delete/i);
    expect(UNINSTALL_STALE_RECORD_HINT).toMatch(/still show as installed/i);
  });
});

describe("dialog wiring — the parts a copy test cannot reach", () => {
  const DIALOG = readFileSync(
    fileURLToPath(new URL("../WorkflowUninstallDialog.tsx", import.meta.url)),
    "utf8",
  )
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("gates [Uninstall] on the preview having arrived", () => {
    // Authorizing a removal the user was never shown is the failure this prevents.
    expect(DIALOG).toContain("disabled={preview === null}");
  });

  it("runs the dry run through the backend command, composing no list of its own", () => {
    expect(DIALOG).toContain('invoke<string>("workflow_uninstall_dry_run")');
  });

  it("persists the gate at run START, not at the terminal Close", () => {
    // The intent is settled at authorization and must survive a crash or a failed run. A
    // gate write deferred to Close would be lost if the user quit mid-run.
    const runAt = DIALOG.indexOf("const runUninstall");
    const intentAt = DIALOG.indexOf('onIntent("uninstall")');
    const invokeAt = DIALOG.indexOf('invoke("workflow_uninstall_start")');
    expect(runAt).toBeGreaterThan(-1);
    expect(intentAt).toBeGreaterThan(runAt);
    expect(intentAt).toBeLessThan(invokeAt);
  });

  it("fires onFinished from the event listener, never inside a state updater", () => {
    // StrictMode double-invokes updaters — the exact defect WP2 shipped (a double write on
    // every settings toggle) and fixed at review.
    const listenerAt = DIALOG.indexOf(
      'useTauriListen<UninstallFinished>("workflow-uninstall-finished"',
    );
    const finishedAt = DIALOG.indexOf("onFinished(payload)");
    expect(listenerAt).toBeGreaterThan(-1);
    expect(finishedAt).toBeGreaterThan(listenerAt);
  });

  it("keeps close separate from intent, so a run is not torn down mid-flight", () => {
    // `uninstall` fires its intent at run-start and closes much later; collapsing the two
    // would unmount the dialog while the script was still running.
    expect(DIALOG).toContain("onClose: () => void");
    expect(DIALOG).toContain("onClick={onClose}");
  });

  it("reveals its ACTION ROW, not the dialog root", () => {
    // Found at operator verify-human: the dialog is taller than the panel body (~700px in
    // ~600px once the preview is populated), and `scrollIntoView({block:"nearest"})` on an
    // element TALLER than its scroll container aligns the top edge and stops — leaving the
    // whole button row below the fold. The operator clicked the toggle and saw nothing.
    //
    // Revealing the buttons is what makes the dialog usable at any height, and it degrades to
    // "reveal the dialog" when the dialog does fit. The ref must therefore sit on the actions
    // row, NOT on the root.
    expect(DIALOG).toContain('block: "nearest"');
    expect(DIALOG).not.toContain('block: "start"');
    expect(DIALOG).toContain(
      'className="install-wizard-actions" ref={revealActionsRef}',
    );
    // Every step's action row gets it — running and done place their buttons at different
    // heights, so a single-step reveal would strand the others.
    const revealed = DIALOG.match(/ref=\{revealActionsRef\}/g) ?? [];
    expect(revealed.length).toBe(3);
    // And the root must NOT carry a competing reveal, which would fight the actions one.
    expect(DIALOG).not.toContain("ref={revealRef}");
  });

  it("re-reveals the actions after the async preview lands, not only on mount", () => {
    // The second half of the same bug, and the one a ref-only guard cannot catch: a callback
    // ref fires at MOUNT, but the `--dry-run` preview arrives later and inserts ~100px ABOVE
    // the buttons, pushing them back below the fold. Measured live: the reveal fired, then the
    // panel sat at scrollTop 163 while the buttons needed 281. So the reveal must ALSO run as
    // an effect keyed on the things that change this dialog's height.
    //
    // Asserted as SINGLE IDENTIFIERS inside the effect's dep array, never as a formatted
    // multi-line expression — a Prettier reflow silently stops that kind of guard matching
    // (this repo has paid for it twice).
    expect(DIALOG).toContain("revealActions()");
    const deps = /\}, \[([^\]]*revealActions[^\]]*)\]/.exec(DIALOG)?.[1] ?? "";
    for (const dep of ["step", "preview", "previewError"]) {
      expect(deps, `the reveal must re-run when ${dep} changes`).toContain(dep);
    }
  });

  it("gates the [Keep] button on the pure decision, not on an inline trigger test", () => {
    // The value tests in uninstallIntercept.test.ts pin the DECISION; this pins its
    // CONSUMPTION. A render that branched inline (`trigger === "toggle" && ...`) — or that
    // forgot to gate at all — would leave every value test green while showing [Keep it
    // installed] on a path where it is incoherent. Same defect shape as the slot bugs this
    // WP hit twice: the decision was right, the render didn't ask.
    expect(DIALOG).toContain("offersKeepIntent(trigger) && (");
    expect(DIALOG).not.toContain('trigger === "toggle"');
    // Both places the Keep affordance appears must be gated: the button AND the hint line
    // that explains it (an ungated hint would describe a button that isn't there).
    const gated = DIALOG.match(/offersKeepIntent\(trigger\)/g) ?? [];
    expect(gated.length).toBe(2);
  });

  it("caps the preview so the dialog fits the panel", () => {
    // The other half of the same bug: even scrolled correctly, a preview at the generic
    // 220px log cap made the dialog ~700px tall. The cap is asserted in the stylesheet by
    // settingsPanelLayout.test.ts; here we pin that the preview actually OPTS IN to it — a
    // `<pre>` that quietly lost the class would restore the original height.
    expect(DIALOG).toContain(
      'className="install-wizard-log uninstall-preview-log"',
    );
  });

  it("uses a callback tail-ref so the done step's <pre> also scrolls", () => {
    // The `done` step renders a DIFFERENT <pre> than `running` — a single attached ref left
    // the final transcript scrolled to the top at WP3.5a verify-human.
    expect(DIALOG).toContain("const tailRef = useCallback");
    const refs = DIALOG.match(/ref=\{tailRef\}/g) ?? [];
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });
});
