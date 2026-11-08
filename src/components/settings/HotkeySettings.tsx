// M14 WP3 — the hotkey reference.
//
// ## Why this group renders from the registry rather than a hand-written list
// It reads the same typed data the registry's two guards check (`chordRegistry.ts`; its header
// says why the map is data), so a chord cannot appear here without being wired, or be wired
// without appearing here.
//
// ## The gate (P2.3)
// Entries are read through `visibleChords(enabled)`, which OMITS gate-dependent chords when
// the gate is off rather than greying them out. ⌘⇧K (Docs) genuinely does nothing while the
// gate is off — `panelForChord` returns null so the keystroke passes through untouched — so
// showing it disabled would be a DEAD AFFORDANCE. With the gate off this group must be
// byte-identical to one in an app that never had the feature.
//
// ⚠️ The gate value is a PROP: SettingsPanel passes `workflowFeatures.value` (the panel's own
// live control), NOT `useWorkflowFeaturesEnabled()`. Both read the same backend, but the
// control is the one that updates the instant the user toggles the checkbox a few rows above —
// subscribing to the hook here would introduce a second source of truth in one panel and make
// the list lag its own switch.

import {
  visibleChords,
  type ChordEntry,
  type ChordHost,
} from "../workspace/chordRegistry";

// ⚠️ `satisfies Record<ChordHost, …>` is the exhaustiveness tie: a host added to the union
// without a section title fails `tsc` here instead of its entries rendering nowhere. Render
// order is this object's key order.
const HOST_TITLES = {
  app: "Application",
  workspace: "Workspace",
  editor: "Editor",
} as const satisfies Record<ChordHost, string>;

const HOST_ORDER = Object.keys(HOST_TITLES) as ChordHost[];

function HotkeyRow({ entry }: { entry: ChordEntry }) {
  return (
    <div
      className={`settings-hotkey-row${entry.claudeskOwned ? "" : " settings-hotkey-row-foreign"}`}
      data-testid={`hotkey-row-${entry.id}`}
    >
      <kbd className="settings-hotkey-chord">{entry.label}</kbd>
      <div className="settings-hotkey-outcomes">
        {entry.outcomes.map((outcome, i) => (
          <div key={i} data-testid="hotkey-outcome">
            <span className="settings-hotkey-description">
              {outcome.description}
            </span>
            {outcome.whenFocused !== undefined && (
              <span className="settings-hotkey-context">
                {" "}
                — when {outcome.whenFocused} has focus
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HotkeySettings({
  workflowFeaturesEnabled,
}: {
  /** The panel's live gate control value — see the header for why it is not the hook. */
  workflowFeaturesEnabled: boolean;
}) {
  // Read ONCE per render and shared by every host section below.
  const chords = visibleChords(workflowFeaturesEnabled);
  return (
    <>
      {HOST_ORDER.map((host) => {
        const entries = chords.filter((entry) => entry.host === host);
        if (entries.length === 0) return null;
        return (
          <div
            key={host}
            className="settings-hotkey-section"
            data-testid={`hotkey-section-${host}`}
          >
            <h4 className="settings-hotkey-section-title">
              {HOST_TITLES[host]}
            </h4>
            {entries.map((entry) => (
              <HotkeyRow key={entry.id} entry={entry} />
            ))}
          </div>
        );
      })}
    </>
  );
}
