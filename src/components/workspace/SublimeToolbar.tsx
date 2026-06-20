// WP8 + WP5 — right-panel toolbar: external Sublime launch affordances.
//
// Lives at the top of each workspace's right panel. Two external-app launchers:
//   - "Open in Sublime" (Sublime TEXT) — button + the in-app ⌘⇧O hotkey (was ⌘⇧E
//     pre-WP5). TRANSITIONAL: removed at WP8 once the in-app editor proves parity.
//   - "Open in Sublime Merge" (WP5) — button only, NO chord. PERMANENT companion
//     surface: the inline diff viewer covers *viewing*, but staging/blame/history/
//     blob-at-rev live in Sublime Merge. Not removed by WP8.
//
// The keydown listener is bound only when this workspace is `active` (the visible /
// focused tab), so the hotkey targets the active tab's project — never a backgrounded
// workspace. Both buttons call their backend command (`sublime_open` / `smerge_open`)
// with the workspace's project path; a rejection is surfaced rather than dead-clicked
// (the WP6 picker lesson).

import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isSublimeChord, SUBLIME_CHORD_LABEL } from "../../sublime/chord";

interface SublimeToolbarProps {
  /** Absolute path Sublime should open. */
  projectPath: string;
  /** True when this workspace is the focused/visible tab — gates the hotkey. */
  active: boolean;
}

function openSublime(projectPath: string) {
  void invoke("sublime_open", { projectPath }).catch((err) => {
    // Surface rather than dead-click; e.g. `subl` failed to spawn.
    console.error("[sublime] open failed:", err);
  });
}

function openSublimeMerge(projectPath: string) {
  void invoke("smerge_open", { projectPath }).catch((err) => {
    // Surface rather than dead-click; e.g. `smerge` failed to spawn.
    console.error("[smerge] open failed:", err);
  });
}

export function SublimeToolbar({ projectPath, active }: SublimeToolbarProps) {
  // In-app ⌘⇧O: only the active (visible) workspace listens, so the chord opens the
  // active tab's project. Re-binds if active/path changes; cleans up on unmount.
  // (Sublime Merge has no chord — it's a button-only affordance.)
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (isSublimeChord(e)) {
        e.preventDefault();
        openSublime(projectPath);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, projectPath]);

  return (
    <div className="sublime-toolbar" data-testid="sublime-toolbar">
      <button
        type="button"
        className="sublime-open-button"
        data-testid="sublime-open"
        onClick={() => openSublime(projectPath)}
        title={`Open this project in Sublime Text (${SUBLIME_CHORD_LABEL})`}
      >
        Open in Sublime
        <kbd className="sublime-kbd">{SUBLIME_CHORD_LABEL}</kbd>
      </button>
      <button
        type="button"
        className="sublime-open-button"
        data-testid="smerge-open"
        onClick={() => openSublimeMerge(projectPath)}
        title="Open this project in Sublime Merge"
      >
        Open in Sublime Merge
      </button>
    </div>
  );
}
