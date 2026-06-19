// WP8 Phase 2 — right-panel toolbar: "Open in Sublime" button + in-app ⌘⇧E hotkey.
//
// Lives at the top of each workspace's right panel. Two ways to open Sublime Text at
// this workspace's project directory, both in-app (no OS-global shortcut, no macOS
// Accessibility permission):
//   - clicking the button, and
//   - pressing ⌘⇧E while Claudesk is focused.
//
// The keydown listener is bound only when this workspace is `active` (the visible /
// focused tab), so the hotkey targets the active tab's project — never a backgrounded
// workspace. Both paths call the backend `sublime_open` command; a rejection is
// surfaced rather than dead-clicked (the WP6 picker lesson).

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

export function SublimeToolbar({ projectPath, active }: SublimeToolbarProps) {
  // In-app ⌘⇧E: only the active (visible) workspace listens, so the chord opens the
  // active tab's project. Re-binds if active/path changes; cleans up on unmount.
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
    </div>
  );
}
