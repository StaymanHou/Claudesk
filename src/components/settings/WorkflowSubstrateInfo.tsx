// M10.9 WP3 Phase 3 — the Settings substrate surface: is the companion workflow system
// installed, how to install it, how to remove it, and (once installed) where to start.
//
// ## Why this lives in Settings and not in the invite (operator decision, 2026-07-29)
// The original WBS had the invite carrying the install commands and running its own presence
// check. The operator moved the boundary: **Settings owns the substrate, the invite owns only
// discovery.** That tightens the invite's own scoping rule — its irreducible non-overlap with
// Settings is *discovery* — which the earlier plan violated by duplicating install content
// into a modal. So the invite is a pitch plus a route, and everything a user needs to actually
// act lives here, in the durable surface they can return to.
//
// ## READ-ONLY in WP3 — deliberately
// Text and status only. No button here writes anything, clones anything, or runs anything.
// The install/uninstall WIZARDS are WP3.5's, and they land in their own module behind the
// sandbox fixture + refuse-guard that
// `SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY` (high) requires.
// A copy-able command the user runs themselves is the honest WP3 affordance.
//
// ## Copy is operator-approved — do NOT freely edit
// The strings below come from `wbs.md` → "Settled copy — 2026-07-29". Two constraints are
// pinned upstream by the companion repo and enforced by `workflowSubstrateCopy.test.ts`:
//   1. Point at exactly `/tutorial-getting-started` — never the tour's steps, flow, the
//      greenfield/brownfield fork, or a permission-mode instruction (§4c anti-brittleness).
//   2. NEVER promise a "quick 5-minute" tour. It is an honest ~10–15 min narrated real run,
//      and the upstream spec structurally forbids the shorter claim (§6).

import type { ReactNode } from "react";

/** Whether the companion workflow system appears to be installed. `null` = not yet resolved. */
export type SubstratePresence = boolean | null;

/**
 * The substrate's **provenance** state, from `workflow_install_state` (M10.9 WP3.5a).
 *
 * `null` = not yet resolved. The three real values mirror Rust's `InstallState` exactly, and the
 * names describe provenance, **not location** — a hand-clone sitting inside Claudesk's own vendor
 * dir is `"developer"`, because Claudesk did not record installing it.
 */
export type InstallProvenance = "absent" | "managed" | "developer" | null;

/** Which arm of the substrate surface a given state renders. */
export type SubstrateArm = "installed" | "absent" | "nothing";

/**
 * Whether to offer the install wizard.
 *
 * **Only `"absent"` gets a button.** The other two arms are the safety boundary, not a UX nicety:
 *   - `"managed"` — already installed by us; installing again is meaningless.
 *   - `"developer"` — a substrate Claudesk did **not** record installing. This is the operator's
 *     live repo (their `~/.claude/skills/` symlinks point into a companion repo they actively
 *     edit) or a hand-clone. Offering to install over it risks `install.sh` repointing symlinks
 *     into a *different* tree, and per the provenance rule Claudesk must describe, never act.
 *   - `null` — unresolved. Same reasoning as `substrateArmFor`: resolve before claiming.
 *
 * Extracted as a pure function so the decision is asserted as a VALUE — the repo rule for any
 * branch whose default is consequential.
 */
export function offersInstallWizard(state: InstallProvenance): boolean {
  return state === "absent";
}

/**
 * Which arm to render for a presence value — extracted as a pure function so the
 * three-state decision is asserted as a VALUE, not as source text.
 *
 * The repo rule (root `CLAUDE.md`) is that `?raw` guards verify STRUCTURE, never runtime, and
 * a three-arm branch with a consequential default is precisely the shape that rule points at.
 * The component below calls THIS function rather than re-deriving the branch, so a test that
 * pins this pins what actually renders.
 *
 * **`null` → `"nothing"` is the load-bearing arm, and it is not a rounding error.** While the
 * presence check is in flight the surface must render *nothing at all*:
 *   - defaulting to `"absent"` would flash install instructions at every user who HAS the
 *     substrate (the operator, on every single panel open);
 *   - defaulting to `"installed"` would hide the instructions from the one person who needs
 *     them, and would claim a `/tutorial-getting-started` command that does not exist yet.
 * Same reasoning as the gate seam's `false` pre-seed default: resolve first, then commit to a
 * claim. A rejected check also lands here as `null` — the backend is contracted never to error,
 * so a rejection means something unexpected, and showing nothing beats asserting a falsehood.
 */
export function substrateArmFor(present: SubstratePresence): SubstrateArm {
  if (present === null) return "nothing";
  return present ? "installed" : "absent";
}

/**
 * The clone target the hand-run instructions name.
 *
 * **Neutral by decision (operator, 2026-07-29), and deliberately NOT the wizard's default.**
 * This was `~/Personal/projects/…` — the operator's own layout, shown to every secondary user
 * (`SURFACE-2026-07-29-QUALITY-WP3-OPERATOR-SPECIFIC-CLONE-PATH`).
 *
 * It does **not** match the wizard's `~/.claudesk/vendor/` default, and that disagreement is the
 * point: these two paths encode opposite intents. A hand-clone is somewhere you *edit*; the
 * vendor dir is somewhere you *don't*. Pointing the manual instructions at the vendor dir would
 * put an unrecorded clone inside Claudesk's managed directory, which reads as `"developer"`
 * (correct — no provenance record) while *looking* managed. Keeping them apart means nothing in
 * the UI ever directs a user into that confusing state.
 */
const CLONE_PATH = "~/dev/my-claude-code-customization";
const CLONE_URL =
  "git@github.com:StaymanHou/stayman-claude-code-customization.git";

/**
 * The tour pointer sentence, extracted as a VALUE so the copy-fidelity test can assert it
 * directly rather than scraping JSX source text.
 *
 * This repo has no DOM test environment (pure logic → vitest, live DOM → the MCP bridge), so
 * the alternative would have been a `?raw` source grep — and the repo rule is that `?raw`
 * guards verify STRUCTURE, never content, and silently stop matching after a formatter
 * reflow (WP2 paid for that twice). Extracting the string makes the assertion a value
 * comparison, which cannot drift out of sync with what renders: the component below
 * interpolates THIS constant, so a test that pins it pins what the user reads.
 *
 * Both upstream-pinned constraints live in this one string:
 *   - names exactly `/tutorial-getting-started` (§4c: the only stable coupling);
 *   - frames the tour as `~10–15 min`, never "quick" or "5-minute" (§6, forbidden).
 */
export const TUTORIAL_POINTER_COPY =
  "New to it? Run /tutorial-getting-started in any workspace — a guided ~10–15 min walkthrough on a sample project.";

/**
 * The ONE command name Claudesk may couple to (return contract §4c).
 *
 * Exported so the copy-fidelity test pins the same literal the component renders. If the
 * companion repo ever renames this, it is a return-contract change communicated through the
 * cross-repo handoff channel — a one-constant edit here.
 */
export const TUTORIAL_COMMAND = "/tutorial-getting-started";

interface WorkflowSubstrateInfoProps {
  /**
   * The install affordance, rendered in the `absent` arm only — directly under the
   * "not installed" status line and ABOVE the manual-steps disclosure.
   *
   * A slot rather than a prop the component acts on: the wizard's open/closed state and the
   * provenance gate live in `SettingsPanel`, and this component stays presentational. Position
   * is the whole point (operator, verify-human 2026-07-30) — the button must sit *under the
   * line that explains why you need it*, and *above* the manual fallback. Rendering it outside
   * this block left it floating above the status line, explaining nothing.
   */
  installAction?: ReactNode;
  /** Result of the read-only `workflow_substrate_installed` check. */
  present: SubstratePresence;
}

/**
 * The install instructions, shared by the absent state (open by default) and the installed
 * state (collapsed — someone who already has it rarely needs the steps again).
 *
 * The permissions step sits behind its own disclosure: it is 10 lines of JSON that would
 * otherwise dominate the panel, but it IS a real step the upstream README documents
 * (symlink-resolution behavior is undocumented, so both symlink and source paths are needed),
 * so it must not degrade to a bare "see the README" pointer.
 */
function InstallSteps() {
  return (
    <div className="substrate-steps" data-testid="substrate-install-steps">
      <ol className="substrate-step-list">
        <li>
          Clone the repo:
          <pre className="substrate-cmd">
            <code>{`git clone ${CLONE_URL} ${CLONE_PATH}`}</code>
          </pre>
        </li>
        <li>
          Run the installer:
          <pre className="substrate-cmd">
            <code>{`cd ${CLONE_PATH}\n./install.sh`}</code>
          </pre>
        </li>
        <li>
          Allow Claude Code to read the skills — add these to{" "}
          <code>~/.claude/settings.json</code>:
          <details className="substrate-details">
            <summary>Show the permissions block</summary>
            <pre className="substrate-cmd">
              <code>{`{
  "permissions": {
    "allow": [
      "Read(~/.claude/**)",
      "Edit(~/.claude/**)",
      "Read(${CLONE_PATH}/**)",
      "Edit(${CLONE_PATH}/**)"
    ]
  }
}`}</code>
            </pre>
            <p className="substrate-note">
              Both the symlink and source paths are needed — symlink-resolution
              behavior is undocumented.
            </p>
          </details>
        </li>
      </ol>
    </div>
  );
}

/** The uninstall line — shown in every resolved state, because it is the reassurance. */
function UninstallLine() {
  return (
    <p className="settings-row-help" data-testid="substrate-uninstall">
      Remove it anytime: <code>./uninstall.sh</code> — standalone, leaves no
      residue.
    </p>
  );
}

/**
 * Substrate status + the contextual next step.
 *
 * Three states, and the `null` one matters: while the presence check is in flight we render
 * NOTHING rather than guessing. Defaulting to "not installed" would flash install
 * instructions at the operator (who has it installed) on every panel open; defaulting to
 * "installed" would hide the instructions from the person who needs them. Same reasoning as
 * the gate seam's `false` pre-seed default — resolve first, then commit to a claim.
 */
export function WorkflowSubstrateInfo({
  present,
  installAction,
}: WorkflowSubstrateInfoProps) {
  // Delegates the three-state decision to the pure `substrateArmFor` rather than re-deriving
  // it inline — that function is what the unit tests pin, so re-deriving here would let the
  // test and the render drift apart while both looked correct.
  const arm = substrateArmFor(present);

  if (arm === "nothing") return null;

  if (arm === "absent") {
    return (
      <div className="substrate-info" data-testid="substrate-info-absent">
        <p className="substrate-status">
          Workflow system: <strong>not installed</strong>
        </p>
        {/* The wizard, directly under the status line it answers and above the manual
            fallback. This is the position the comment below predicted. */}
        {installAction}
        {/* COLLAPSED by default (operator, 2026-07-29 — the expanded form ate the panel).
            The steps are ~14 lines of commands plus a JSON block; left open they pushed
            Analytics and Updates below the fold and made the most-used settings surface
            worse. Same judgment that retired the picker settings strip in WP1: measure what
            the incumbent spends before adding to it.

            The STATUS line stays outside the disclosure — "not installed" is the fact a
            reader needs at a glance, and burying it would defeat the surface. Only the
            how-to is behind the click.

            WP3.5a DISCHARGED the note that used to sit here: the absent state now gets the
            wizard button via `installAction` (rendered just above), and these commands are the
            fallback — kept because the developer-install row has no wizard by design. */}
        <details
          className="substrate-details"
          data-testid="substrate-install-disclosure"
        >
          <summary>Install it yourself (manual steps)</summary>
          <p className="settings-row-help">
            A one-time install, outside Claudesk:
          </p>
          <InstallSteps />
          {/* The back-out reassurance belongs INSIDE the disclosure in this state, not
              beside it: a standalone "Remove it anytime" line under "not installed" invites
              the reader to remove something that isn't there. Here it lands where it
              actually does work — as the last thing you read before deciding to install,
              which is the try-and-back-out story the companion repo built uninstall.sh for.
              The INSTALLED arm keeps it top-level, where it is a live affordance. */}
          <UninstallLine />
        </details>
      </div>
    );
  }

  return (
    <div className="substrate-info" data-testid="substrate-info-installed">
      <p className="substrate-status">
        Workflow system: <strong>installed</strong>{" "}
        <span className="substrate-ok" aria-hidden="true">
          ✓
        </span>
      </p>
      {/* Rendered from the exported constant, NOT re-typed inline — the copy-fidelity test
          asserts that constant, and a hand-copied duplicate here would let the two drift
          while the test stayed green (pinning a string nobody reads). The <code> styling is
          applied by splitting on the command token rather than by re-authoring the text. */}
      <p className="settings-row-help" data-testid="substrate-tutorial-pointer">
        {TUTORIAL_POINTER_COPY.split(TUTORIAL_COMMAND).map((part, i, parts) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <code>{TUTORIAL_COMMAND}</code>}
          </span>
        ))}
      </p>
      {/* UNGUARANTEED COUPLING — operator kept this line knowing the risk (2026-07-29).
          §4c pins exactly ONE command name: /tutorial-getting-started. The four below carry
          no upstream stability guarantee, so an upstream rename makes this text silently
          stale. Deliberately NOT pinned by the copy-fidelity test: asserting them would turn
          an upstream rename into a test failure in THIS repo, which is the brittleness §4c
          exists to prevent. If they drift, fix the copy; don't add a guard. */}
      <p className="settings-row-help">
        Entry points: <code>/session-start</code> routes you ·{" "}
        <code>/feature-plan</code>, <code>/task-plan</code>,{" "}
        <code>/incident-report</code> for direct starts.
      </p>
      <details className="substrate-details">
        <summary>Manual install steps (for another machine)</summary>
        <InstallSteps />
      </details>
      <UninstallLine />
    </div>
  );
}
