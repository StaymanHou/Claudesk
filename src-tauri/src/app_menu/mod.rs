//! Native macOS application menu (the menu bar).
//!
//! Claudesk previously ran with Tauri's default auto-generated menu; this module
//! builds a real menu that **mirrors existing features only** — every item maps to
//! an action the app already has (a keyboard chord or a launcher button). No menu
//! item invents a capability the app lacks.
//!
//! ## The bridge (why items are split three ways)
//!
//! Tauri-2 menu accelerators STEAL the keystroke from the WKWebView/CodeMirror on
//! macOS (research 2026-06-24). So we never put a real accelerator on an item whose
//! key the frontend already owns — that would break the existing handler. Items fall
//! into three classes:
//!
//! 1. **OS-native** (`PredefinedMenuItem`, via the builder's `.about()`, `.quit()`,
//!    `.copy()`, `.undo()`, `.minimize()`, … helpers): About (with version metadata),
//!    Quit, the Edit group (undo/redo/cut/copy/paste/select-all), the Window group.
//!    These wire to the macOS responder chain automatically — Cut/Copy/Paste operate
//!    on whatever holds focus (incl. CodeMirror's contentEditable) with no custom code.
//!
//! 2. **Functional custom items** — a `MenuItem` with a stable id and **NO accelerator**
//!    (the shortcut is shown as plain text in the label for discoverability). On click
//!    these `app.emit("menu", id)`; the frontend listens and either re-dispatches the
//!    matching synthetic `KeyboardEvent` (panel-switch, finder, search, palette,
//!    close-tab) or calls a React callback (New Workspace, the Sublime/Finder launchers).
//!
//! 3. **Label-only items** — CodeMirror-internal chords (Save ⌘S, Find ⌘F, Find Next
//!    ⌘G, Find&Replace ⌘R, Zoom ⌘=/⌘-/⌘0) and the representative digit chords
//!    (Switch Workspace/Tab 1–9). A synthetic DOM event can't drive CM6's internal
//!    keymap, and a real accelerator would steal the key — so these are **disabled**
//!    items that show the shortcut as a cheat-sheet. The key keeps working via CM6.
//!
//! The id strings are the single source of truth for the frontend bridge — keep them
//! in sync with `src/menu/menuBridge.ts`.

use tauri::menu::{
    AboutMetadataBuilder, CheckMenuItemBuilder, Menu, MenuItemBuilder, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::pip::layout::PipMode;

/// The Tauri event name the menu emits a clicked item's id on. The frontend
/// (`App.tsx`) subscribes once and dispatches by id (`menu/menuBridge.ts`).
pub const MENU_EVENT: &str = "menu";

/// Functional menu-item ids — the ones the frontend acts on. Label-only items
/// (disabled cheat-sheet rows) deliberately have NO id here; they never emit.
pub mod ids {
    // Class 2a — re-dispatch a synthetic KeyboardEvent (app-level document chords).
    pub const PANEL_EDITOR: &str = "view.panel.editor"; // ⌘⇧E
    pub const PANEL_DIFF: &str = "view.panel.diff"; // ⌘⇧D
    pub const PANEL_TERMINAL: &str = "view.panel.terminal"; // ⌘⇧T
    pub const COMMAND_PALETTE: &str = "view.commandPalette"; // ⌘⇧P
    pub const GO_TO_FILE: &str = "find.goToFile"; // ⌘P finder
    pub const FIND_IN_FILES: &str = "find.findInFiles"; // ⌘⇧F search
    pub const CLOSE_TAB: &str = "file.closeTab"; // ⌘W

    // Class 2b — call a React callback (no existing accelerator).
    pub const NEW_WORKSPACE: &str = "file.newWorkspace"; // opens the picker
    pub const OPEN_SUBLIME_TEXT: &str = "workspace.openSublimeText";
    pub const OPEN_SUBLIME_MERGE: &str = "workspace.openSublimeMerge";
    pub const REVEAL_IN_FINDER: &str = "workspace.revealInFinder";
    // WP5 Phase 2 (rework) — the tri-state PiP MODE, as three radio-style View-menu items
    // (the active one checked). A click sets that mode via `pip_set_mode`. Replaces the
    // old single PIP_TOGGLE + PIP_AUTO_SUMMON checkbox (the inferred-regime dead-end).
    pub const PIP_MODE_OFF: &str = "view.pip.mode.off";
    pub const PIP_MODE_ON: &str = "view.pip.mode.on";
    pub const PIP_MODE_AUTO: &str = "view.pip.mode.auto";
}

/// Every functional menu-item id, in one place. `is_functional_id` checks membership
/// here and `build_menu` assigns each to a `MenuItem`; keeping them in a single slice
/// is the single source of truth (a new functional item adds its id here AND to its
/// `MenuItemBuilder::with_id` call). Also lets the tests pin uniqueness + non-emptiness.
pub const FUNCTIONAL_IDS: &[&str] = &[
    ids::PANEL_EDITOR,
    ids::PANEL_DIFF,
    ids::PANEL_TERMINAL,
    ids::COMMAND_PALETTE,
    ids::GO_TO_FILE,
    ids::FIND_IN_FILES,
    ids::CLOSE_TAB,
    ids::NEW_WORKSPACE,
    ids::OPEN_SUBLIME_TEXT,
    ids::OPEN_SUBLIME_MERGE,
    ids::REVEAL_IN_FINDER,
    ids::PIP_MODE_OFF,
    ids::PIP_MODE_ON,
    ids::PIP_MODE_AUTO,
];

/// Whether a menu-item id is one the frontend acts on (i.e. the click should emit
/// the `menu` event). Pure — unit-tested. Label-only items return false (they're
/// disabled and never fire, but this guards the handler defensively).
pub fn is_functional_id(id: &str) -> bool {
    FUNCTIONAL_IDS.contains(&id)
}

/// Build the full application menu. Called from `.setup()` and applied via
/// `app.set_menu(menu)`. The version shown in the About panel comes from the app's
/// `PackageInfo` (sourced from `tauri.conf.json`), so it never drifts from the build.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg = app.package_info();
    let version = pkg.version.to_string();

    let about_metadata = AboutMetadataBuilder::new()
        .name(Some("Claudesk"))
        .version(Some(version))
        .build();

    // ── Claudesk (app menu) ───────────────────────────────────────────────────
    // About (native panel, version) + the standard macOS app-menu service/hide/quit
    // chain. `.about(Some(meta))` and `.quit()` are PredefinedMenuItems.
    let app_menu = SubmenuBuilder::new(app, "Claudesk")
        .about(Some(about_metadata))
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // ── File ──────────────────────────────────────────────────────────────────
    // New Workspace + Close Tab are functional (frontend acts). Save is label-only
    // (CM6 owns ⌘S; a real accel would steal it).
    // ⌘⇧N (displayed text only — no real accelerator registered): ⌘N is reserved for
    // the editor's future "add new file" (SURFACE-2026-06-24-EDITOR-ADD-NEW-FILE).
    let new_workspace =
        MenuItemBuilder::with_id(ids::NEW_WORKSPACE, "New Workspace\t⌘⇧N").build(app)?;
    let close_tab = MenuItemBuilder::with_id(ids::CLOSE_TAB, "Close Tab\t⌘W").build(app)?;
    let save = MenuItemBuilder::with_id("file.save.label", "Save\t⌘S")
        .enabled(false)
        .build(app)?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_workspace)
        .item(&close_tab)
        .separator()
        .item(&save)
        .build()?;

    // ── Edit ──────────────────────────────────────────────────────────────────
    // All predefined → native responder chain drives CodeMirror / inputs directly.
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;

    // ── Find ──────────────────────────────────────────────────────────────────
    // In-file find/replace are CM6-internal → label-only. Go to File + Find in Files
    // are app-level document chords → functional (re-dispatch).
    let find_in_file = MenuItemBuilder::with_id("find.inFile.label", "Find in File\t⌘F")
        .enabled(false)
        .build(app)?;
    let find_next = MenuItemBuilder::with_id("find.next.label", "Find Next\t⌘G")
        .enabled(false)
        .build(app)?;
    let find_replace = MenuItemBuilder::with_id("find.replace.label", "Find & Replace\t⌘R")
        .enabled(false)
        .build(app)?;
    let go_to_file = MenuItemBuilder::with_id(ids::GO_TO_FILE, "Go to File…\t⌘P").build(app)?;
    let find_in_files =
        MenuItemBuilder::with_id(ids::FIND_IN_FILES, "Find in Files…\t⌘⇧F").build(app)?;
    let find_menu = SubmenuBuilder::new(app, "Find")
        .item(&find_in_file)
        .item(&find_next)
        .item(&find_replace)
        .separator()
        .item(&go_to_file)
        .item(&find_in_files)
        .build()?;

    // ── View ──────────────────────────────────────────────────────────────────
    // Panel switches + palette are functional. Zoom is CM6-internal → label-only.
    let panel_editor =
        MenuItemBuilder::with_id(ids::PANEL_EDITOR, "Editor Panel\t⌘⇧E").build(app)?;
    let panel_diff = MenuItemBuilder::with_id(ids::PANEL_DIFF, "Diff Panel\t⌘⇧D").build(app)?;
    let panel_terminal =
        MenuItemBuilder::with_id(ids::PANEL_TERMINAL, "Terminal Panel\t⌘⇧T").build(app)?;
    let command_palette =
        MenuItemBuilder::with_id(ids::COMMAND_PALETTE, "Command Palette\t⌘⇧P").build(app)?;
    let zoom_in = MenuItemBuilder::with_id("view.zoomIn.label", "Zoom In\t⌘=")
        .enabled(false)
        .build(app)?;
    let zoom_out = MenuItemBuilder::with_id("view.zoomOut.label", "Zoom Out\t⌘-")
        .enabled(false)
        .build(app)?;
    // WP5 Phase 2 (rework) — the tri-state PiP MODE as three radio-style CheckMenuItems
    // (Off / On / Auto), the active one checked from the persisted mode (default Auto). A
    // click sets that mode via `pip_set_mode` (the frontend bridge); the menu is rebuilt
    // on the `pip-mode` broadcast so the checkmark tracks the backend. NO accelerators (the
    // native-menu pattern). Replaces the old Toggle + Auto-summon-checkbox pair. A read
    // failure falls back to Auto (the default).
    let pip_mode = app
        .path()
        .app_data_dir()
        .ok()
        .and_then(|dir| crate::config_store::settings::read_pip_mode(&dir).ok())
        .unwrap_or_default();
    let pip_off = CheckMenuItemBuilder::with_id(ids::PIP_MODE_OFF, "PiP: Off")
        .checked(pip_mode == PipMode::Off)
        .build(app)?;
    let pip_on = CheckMenuItemBuilder::with_id(ids::PIP_MODE_ON, "PiP: On (pinned)")
        .checked(pip_mode == PipMode::On)
        .build(app)?;
    let pip_auto = CheckMenuItemBuilder::with_id(ids::PIP_MODE_AUTO, "PiP: Auto (summon when away)")
        .checked(pip_mode == PipMode::Auto)
        .build(app)?;
    let zoom_reset = MenuItemBuilder::with_id("view.zoomReset.label", "Reset Zoom\t⌘0")
        .enabled(false)
        .build(app)?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&panel_editor)
        .item(&panel_diff)
        .item(&panel_terminal)
        .separator()
        .item(&command_palette)
        .separator()
        .item(&zoom_in)
        .item(&zoom_out)
        .item(&zoom_reset)
        .separator()
        .item(&pip_off)
        .item(&pip_on)
        .item(&pip_auto)
        .build()?;

    // ── Workspace ───────────────────────────────────────────────────────────────
    // Representative digit-chord cheat-sheet rows (label-only — disabled), then the
    // three launcher actions (functional, NO accelerator per operator: no new hotkeys).
    let switch_workspace =
        MenuItemBuilder::with_id("workspace.switch.label", "Switch Workspace 1–9\t⌘⇧1…9")
            .enabled(false)
            .build(app)?;
    let switch_tab = MenuItemBuilder::with_id("workspace.switchTab.label", "Switch Tab 1–9\t⌘1…9")
        .enabled(false)
        .build(app)?;
    let open_sublime =
        MenuItemBuilder::with_id(ids::OPEN_SUBLIME_TEXT, "Open in Sublime Text").build(app)?;
    let open_merge =
        MenuItemBuilder::with_id(ids::OPEN_SUBLIME_MERGE, "Open in Sublime Merge").build(app)?;
    let reveal_finder =
        MenuItemBuilder::with_id(ids::REVEAL_IN_FINDER, "Reveal in Finder").build(app)?;
    let workspace_menu = SubmenuBuilder::new(app, "Workspace")
        .item(&switch_workspace)
        .item(&switch_tab)
        .separator()
        .item(&open_sublime)
        .item(&open_merge)
        .item(&reveal_finder)
        .build()?;

    // ── Window ────────────────────────────────────────────────────────────────
    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .fullscreen()
        .separator()
        .close_window()
        .build()?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &find_menu,
            &view_menu,
            &workspace_menu,
            &window_menu,
        ],
    )
}

/// The `on_menu_event` handler: for a functional id, broadcast it to the frontend on
/// the `menu` event. Predefined items (Edit/Window/About/Quit) are handled natively
/// by macOS and never reach here; label-only items are disabled and never fire.
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    if is_functional_id(id) {
        // Surface, never swallow (the WP6 IPC-error lesson): a failed emit means the
        // menu silently dead-clicks, so log it.
        if let Err(e) = app.emit(MENU_EVENT, id) {
            eprintln!("[claudesk] menu emit failed for {id}: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn functional_ids_are_recognized() {
        for id in FUNCTIONAL_IDS {
            assert!(is_functional_id(id), "{id} should be functional");
        }
    }

    #[test]
    fn functional_ids_are_unique_and_non_empty() {
        // A duplicated id would make two menu items collide on click (both emit the
        // same `menu` event → the frontend can't tell them apart); an empty id would
        // match the handler's defensive `""` guard. Pin both invariants — build_menu
        // assigns one MenuItem per id, so uniqueness here = no menu-item ambiguity.
        let mut seen = std::collections::HashSet::new();
        for id in FUNCTIONAL_IDS {
            assert!(!id.is_empty(), "a functional id must not be empty");
            assert!(seen.insert(*id), "duplicate functional id: {id}");
        }
        assert_eq!(
            seen.len(),
            FUNCTIONAL_IDS.len(),
            "every functional id must be distinct"
        );
    }

    #[test]
    fn label_only_ids_are_not_functional() {
        // The disabled cheat-sheet rows must never be treated as functional.
        for id in [
            "file.save.label",
            "find.inFile.label",
            "find.next.label",
            "find.replace.label",
            "view.zoomIn.label",
            "view.zoomOut.label",
            "view.zoomReset.label",
            "workspace.switch.label",
            "workspace.switchTab.label",
            "",
            "unknown.id",
        ] {
            assert!(!is_functional_id(id), "{id} should NOT be functional");
        }
    }
}
