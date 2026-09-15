// M14 WP3 Phase 1 — the chord registry: the CHORD-OWNERSHIP MAP as typed data.
//
// ## Why this module exists
// This map used to be a ~60-line COMMENT BLOCK at the top of editor/paletteCommands.ts,
// referenced by name from at least three other modules ("see the chord-ownership map in
// editor/paletteCommands.ts"). Being prose it had three problems, all of which this module
// fixes:
//
//   1. It could not be RENDERED — so the app had ~15 keyboard chords and no surface that
//      told a user what they were. That is the user-facing gap M14 WP3 exists to close.
//   2. It could not be TESTED against the code it described, so it could drift silently
//      (docs/lessons/source-text-guards.md — a comment is not a guard).
//   3. It was ALREADY INCOMPLETE when extracted: the comment map documented ⌘⇧P/⌘P/⌘⇧E/D/T/K/
//      ⌘⇧A/⌘⇧O/⌘⇧F/⌘1-9/⌘W/⌘T/⌘⇧1-9 but silently omitted ⌘⇧N (new workspace), ⌘, (settings)
//      and ⌘N (new file). Drift had already happened — which is the argument for this module
//      rather than a tidier comment.
//
// ## What this module is NOT
// It is NOT a dispatcher. Nothing here registers a listener, and no host calls into this
// module to decide whether a chord fired — the predicates in the sibling *Chord.ts modules
// remain the only matchers, unchanged. This is a DESCRIPTION of the chord surface, kept
// honest by chordRegistry.test.ts. Keeping it descriptive is deliberate: making it a
// dispatcher would mean rewriting three working registration hosts for no user-visible gain.
//
// ## Read-only by ruling (M14 WP3, operator 2026-09-15)
// v1 ships a read-only reference list. There is deliberately NO rebinding, NO persistence,
// and NO reserved-range ENFORCEMENT — a `reserved` entry below is DOCUMENTATION for a future
// rebinding version, not a live constraint. Building enforcement now would be an unreachable
// guard (the M12 dead-`/exit` shape), which is exactly what this WP's reachability test
// exists to prevent.

import type { ChordEvent } from "./chordEvent";

/**
 * Where a chord is registered — which determines when it can fire, and therefore why two
 * chords that look similar behave differently.
 *
 * - `app` — a capture-phase document listener in App.tsx. Fires regardless of focus.
 * - `workspace` — registered by RightPanelHost.tsx, EditorPanel.tsx (⌘⇧P) or Workspace.tsx
 *   (terminal font zoom). Scoped to an open workspace. ⚠️ THREE host files, not one — a
 *   completeness guard that assumed a single file would miss two thirds of this set.
 * - `editor` — CodeMirror's own keymap (editorExtensions.ts `coreKeymap`). ⚠️ NOT Claudesk's
 *   to rebind; listed so the surface does not lie by omission about why ⌘F behaves
 *   differently inside the editor than the ⌘⇧F project search.
 */
export type ChordHost = "app" | "workspace" | "editor";

/**
 * One outcome a chord can produce. Most chords have exactly one.
 *
 * ⚠️ A chord can have MORE THAN ONE, and that is not a modelling nicety — ⌘W really does
 * mean two different things. RightPanelHost routes the SAME `isCloseTabChord(e)` result
 * through `shouldCloseTerminalOnChord({ isCloseChord, … })`, which decides by focus context
 * whether the terminal branch or the editor-tab branch wins. So ⌘W is ONE chord with TWO
 * context-scoped outcomes — NOT two chords, and NOT two predicates. A registry keyed 1:1 on
 * predicates would misrepresent it.
 */
export interface ChordOutcome {
  /** What happens, user-facing. */
  readonly description: string;
  /** The focus context this outcome applies in, when the chord is context-scoped. */
  readonly whenFocused?: string;
}

/** One chord in the app's keyboard surface. */
export interface ChordEntry {
  /** Stable id — React key and test handle. Never user-facing. */
  readonly id: string;
  /** Display label, e.g. "⌘⇧F". The single source of truth for this chord's rendering. */
  readonly label: string;
  /** Where it is registered — see {@link ChordHost}. */
  readonly host: ChordHost;
  /**
   * What it does. Length > 1 means context-scoped (see {@link ChordOutcome}).
   * Never empty.
   */
  readonly outcomes: readonly ChordOutcome[];
  /**
   * The matcher module this entry describes, as a repo-relative path, or `null` for a
   * chord Claudesk does not own (the CM6 set) or a range with no single predicate.
   *
   * ⚠️ This is a STRING, not a function reference, and that is deliberate. Predicate
   * signatures VARY — `isSettingsChord` returns boolean, `workspaceSwitchIndex` returns
   * `number | null`, `panelForChord` returns `RightPanel | null` and takes a SECOND
   * argument. There is no honest common call signature, so this module does not pretend
   * there is one by typing them as `(e: ChordEvent) => boolean`. The reachability test
   * resolves these paths against the real registration hosts instead.
   */
  readonly matcher: string | null;
  /**
   * True when Claudesk owns the binding. `false` for the CM6 set — shown, but marked.
   */
  readonly claudeskOwned: boolean;
  /**
   * True when this chord only functions with the workflow-features gate ON.
   *
   * ⚠️ Load-bearing for the Settings render. `panelForChord(e, enabled)` returns `null` for
   * ⌘⇧K while the gate is off — deliberately, so the keystroke passes through untouched
   * rather than being swallowed by a no-op handler. A gate-off user who saw "⌘⇧K — Docs
   * panel" in Settings would be looking at a DEAD AFFORDANCE, which is precisely what the
   * `gate-substrate-dependent-feature-class-behind-default-off-opt-in` prior forbids: with
   * the gate off the app must be byte-identical to one that never had the feature.
   */
  readonly requiresWorkflowGate: boolean;
  /**
   * Documentation only — never enforced. `"range"` marks a whole reserved keyspace
   * (⌘⇧+digit), `"free"` marks a chord deliberately left unassigned.
   */
  readonly reservation?: "range" | "free";
}

/**
 * Every chord in the app, in display order (grouped by host).
 *
 * ⚠️ Adding a chord in a future WP means adding an entry HERE. `chordRegistry.test.ts`
 * asserts each entry's `matcher` is actually invoked by a registration host, so an entry
 * added without wiring — or wiring added without an entry — fails the suite rather than
 * drifting the way the old comment map did.
 */
export const CHORD_REGISTRY: readonly ChordEntry[] = [
  // ---- app-level: capture-phase document listeners in App.tsx ----
  {
    id: "workspace-switch",
    label: "⌘⇧1–⌘⇧9",
    host: "app",
    outcomes: [
      { description: "Promote the Nth filmstrip tile to center stage" },
    ],
    matcher: "components/workspace/workspaceSwitchChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
    // ⚠️ A RANGE, not one binding — reserved for filmstrip switching (operator 2026-06-21).
    // ⌘⇧0 is deliberately not a switch chord (0 is a no-op index).
    reservation: "range",
  },
  {
    id: "new-workspace",
    label: "⌘⇧N",
    host: "app",
    outcomes: [{ description: "Open a new workspace" }],
    matcher: "components/workspace/newWorkspaceChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "dashboard",
    label: "⌘⇧A",
    host: "app",
    outcomes: [{ description: "Toggle the global time-analytics dashboard" }],
    matcher: "components/workspace/dashboard/dashboardChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "settings",
    label: "⌘,",
    host: "app",
    outcomes: [{ description: "Open Settings" }],
    matcher: "components/settings/settingsChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },

  // ---- workspace-scoped: registered by RightPanelHost.tsx ----
  {
    id: "command-palette",
    label: "⌘⇧P",
    host: "workspace",
    outcomes: [{ description: "Open the editor command palette" }],
    matcher: "components/workspace/editor/paletteCommands.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "file-finder",
    label: "⌘P",
    host: "workspace",
    outcomes: [{ description: "Go to file (fuzzy finder)" }],
    matcher: "components/workspace/finder/finderChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "project-search",
    label: "⌘⇧F",
    host: "workspace",
    outcomes: [{ description: "Find in files (project-wide search)" }],
    matcher: "components/workspace/search/searchChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "new-file",
    label: "⌘N",
    host: "workspace",
    outcomes: [{ description: "New file in the file tree" }],
    matcher: "components/workspace/filetree/newFileChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "panel-select-editor",
    label: "⌘⇧E",
    host: "workspace",
    outcomes: [{ description: "Show the Editor panel" }],
    matcher: "components/workspace/panelHost.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "panel-select-diff",
    label: "⌘⇧D",
    host: "workspace",
    outcomes: [{ description: "Show the Diff panel" }],
    matcher: "components/workspace/panelHost.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "panel-select-terminal",
    label: "⌘⇧T",
    host: "workspace",
    outcomes: [{ description: "Show the Terminal panel" }],
    matcher: "components/workspace/panelHost.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "panel-select-docs",
    label: "⌘⇧K",
    host: "workspace",
    outcomes: [{ description: "Show the Docs panel" }],
    matcher: "components/workspace/panelHost.ts",
    claudeskOwned: true,
    // ⚠️ The one gate-dependent chord. panelForChord returns null while the gate is off.
    requiresWorkflowGate: true,
  },
  {
    id: "tab-switch",
    label: "⌘1–⌘9",
    host: "workspace",
    outcomes: [
      {
        description:
          "Activate the Nth open editor tab in the focused pane (⌘9 = last)",
      },
    ],
    matcher: "components/workspace/editor/tabSwitchChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "close-w",
    label: "⌘W",
    host: "workspace",
    // ⚠️ TWO outcomes, ONE chord, ONE predicate — see ChordOutcome.
    outcomes: [
      {
        description: "Close the focused terminal",
        whenFocused: "a right-panel terminal",
      },
      {
        description: "Close the active editor tab",
        whenFocused: "the editor",
      },
    ],
    matcher: "components/workspace/editor/closeTabChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },
  {
    id: "new-terminal",
    label: "⌘T",
    host: "workspace",
    outcomes: [{ description: "Open a new terminal in the terminal panel" }],
    matcher: "components/workspace/newTerminalChord.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },

  {
    id: "terminal-font-zoom",
    label: "⌘= / ⌘- / ⌘0",
    host: "workspace",
    // ⚠️ THREE context-scoped outcomes, and the third is "Claudesk does not handle it".
    // Workspace.tsx routes by LIVE DOM focus: left half → the CC terminal; right half with
    // the terminal panel focused → that terminal; anything else → the chord is NOT swallowed
    // and CM6's own keymap handles it (see the `cm6-font-zoom` entry below). The same keys
    // therefore belong to two DIFFERENT owners depending on focus, which is why both entries
    // exist and neither may be deleted as a duplicate.
    outcomes: [
      {
        description: "Grow / shrink / reset the Claude Code terminal font",
        whenFocused: "the CC terminal (left half)",
      },
      {
        description: "Grow / shrink / reset the right-panel terminal font",
        whenFocused: "a right-panel terminal",
      },
    ],
    matcher: "components/workspace/terminalFontZoom.ts",
    claudeskOwned: true,
    requiresWorkflowGate: false,
  },

  // ---- editor-internal: CodeMirror's own keymap. NOT Claudesk's to rebind. ----
  // Listed because omitting them would make the surface lie by omission: a user who sees
  // ⌘⇧F "find in files" and presses ⌘F inside the editor gets something else entirely, and
  // nothing would explain why.
  {
    id: "cm6-find",
    label: "⌘F",
    host: "editor",
    outcomes: [
      { description: "Find within the open file", whenFocused: "the editor" },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
  {
    id: "cm6-search-panel",
    label: "⌘R",
    host: "editor",
    outcomes: [
      { description: "Open the search panel", whenFocused: "the editor" },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
  {
    id: "cm6-save",
    label: "⌘S",
    host: "editor",
    outcomes: [
      { description: "Save the open file", whenFocused: "the editor" },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
  {
    id: "cm6-select-next",
    label: "⌘D",
    host: "editor",
    outcomes: [
      { description: "Select the next occurrence", whenFocused: "the editor" },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
  {
    id: "cm6-toggle-wrap",
    label: "⌘\\",
    host: "editor",
    outcomes: [
      { description: "Toggle line wrapping", whenFocused: "the editor" },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
  {
    id: "cm6-font-zoom",
    label: "⌘= / ⌘- / ⌘0",
    host: "editor",
    outcomes: [
      {
        description: "Grow / shrink / reset the editor font",
        whenFocused: "the editor",
      },
    ],
    matcher: null,
    claudeskOwned: false,
    requiresWorkflowGate: false,
  },
];

/**
 * THE single accessor. Every consumer reads the registry through this function.
 *
 * ⚠️ This funnel is the point of the design, not a convenience wrapper. Enumerating the
 * registry as data proves the SET exists; it does NOT prove each entry has a CALLER — the
 * trap that shipped a CRITICAL at M11 WP4 and is flagged twice in CLAUDE.md. Funnelling
 * every read through one function means the reachability test has ONE thing to guard, and a
 * consumer that bypasses it is a visible deviation rather than an invisible one.
 *
 * @param enabled Whether the workflow-features gate is on. When off, gate-dependent chords
 * are omitted entirely — NOT greyed out — so the surface matches what actually fires.
 *
 * ⚠️ The parameter is named `enabled`, not `gateEnabled`, and that is load-bearing rather
 * than stylistic: `offInvariantGuard.test.ts` proves a gate-touching module actually
 * CONSUMES the gate value by looking for `enabled ? …` / `enabled && …` / `if (enabled)` in
 * the export body. It deliberately rejects type-level evidence (a `WorkflowGateValue`
 * annotation, or `enabled` merely sitting in a parameter list), because `panelHost.ts` is a
 * pure module whose gate arrives as a parameter and a signature-level match would exempt it
 * without any gate being honored. Renaming this parameter disarms that arm for this module.
 */
export function visibleChords(enabled: boolean): readonly ChordEntry[] {
  if (enabled) return CHORD_REGISTRY;
  return CHORD_REGISTRY.filter((entry) => !entry.requiresWorkflowGate);
}

/** Label lookup by id. Throws on an unknown id — a typo'd id is a bug, not a blank label. */
export function chordLabel(id: string): string {
  const entry = CHORD_REGISTRY.find((e) => e.id === id);
  if (!entry) throw new Error(`chordLabel: unknown chord id "${id}"`);
  return entry.label;
}

// ⚠️ Only `ChordEvent` is re-exported here. The four pre-existing `*_CHORD_LABEL` constants
// (PALETTE_/FINDER_/SEARCH_/NEW_FILE_) deliberately STAY in their original home modules with
// their existing consumers (ProjectSearch.tsx, FileFinder.tsx, CommandPalette.tsx) untouched.
//
// ⚠️ So the label strings ARE duplicated between those constants and this registry — an
// earlier version of this comment claimed a single source of truth the code does not
// establish, which was caught at verify-self. The duplication is bounded (four labels) and
// the honest tradeoff is deliberate: deleting an ES-module export is a RUNTIME failure, not a
// tsc error (M13.5 WP3 shipped a blank app with `verify:auto` AND `tsc` both green because a
// deleted export's consumers were migrated in a later phase). Collapsing the duplication means
// migrating three consumers, which belongs in its own change with its own boot smoke-test —
// not bolted onto a data-extraction phase.
export type { ChordEvent };
