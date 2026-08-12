<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# Native application menu bar (SHIPPED 2026-06-24, commit f815154)

A standalone between-milestone feature (operator request, after M4 close): a real macOS menu bar (Claudesk · File · Edit · Find · View · Workspace · Window) replacing Tauri's default auto-menu. **Mirrors existing features only — adds no new behavior.** Built in `src-tauri/src/app_menu/` (`build_menu` + `on_menu_event` handler, set app-wide in `.setup()` via `app.set_menu`).

**Key decision — the menu carries NO real accelerators.** A Tauri-2 menu accelerator intercepts the keystroke at the AppKit level *before* the WKWebView/CodeMirror sees it (would break the existing chord handlers + CM6 keymap). So menu items split three ways:
- **Predefined** (`PredefinedMenuItem` via the builder: About-with-version, Quit, the Edit group, Window group) → wire to the native macOS responder chain automatically; Cut/Copy/Paste/Undo operate on the focused webview text (incl. CM6) with no custom code. About shows the version from `app.package_info()` (sourced from `tauri.conf.json`).
- **Functional custom items** → no accelerator; on click the Rust `on_menu_event` emits the item's id on a `menu` Tauri event. The frontend (`src/menu/menuBridge.ts`, a pure id→action map) maps it to either a **synthetic `KeyboardEvent` re-dispatched on `document`** — reproducing the exact chord the existing capture-phase handlers already own (panel-switch ⌘⇧E/D/T, finder ⌘P, search ⌘⇧F, palette ⌘⇧P, close-tab ⌘W), so the menu is a pure alias with zero handler changes — or a **React callback** (New Workspace picker; the Sublime/Merge/Finder launchers, acting on the focused workspace). The `App.tsx` `menu` listener uses the `cancelled`-flag guard (same as `useWorkspaceStatus`) against StrictMode async-listen double-registration.
- **Label-only (disabled)** rows for CM6-internal chords (Save/Find/Zoom) and the representative digit chords (Switch Workspace/Tab 1–9) — a discoverability cheat-sheet showing the shortcut as `\t⌘…` label text; the keys keep working in CM6.

**Known debt (backlogged):** the functional menu-item id strings are duplicated across Rust `app_menu::ids` and TS `MENU_IDS` with no mechanical guard (a drift silently dead-clicks one item with green tests) — see `SURFACE-2026-06-24-QUALITY-APPMENU-CROSS-LANG-ID-CONTRACT`.

