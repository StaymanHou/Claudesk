// Native macOS application menu (the menu bar). Mirrors existing features only —
// predefined items (About/version, Edit, Window) wire to the native responder chain;
// custom items emit a `menu` event the frontend bridge acts on (see app_menu).
mod app_menu;
mod cc_session;
mod config_store;
mod editor_fs;
// Process-wide PATH fix: a Finder/Dock-launched macOS app inherits the minimal
// launchd PATH, not the user's shell PATH, so user-installed CLIs (claude, subl,
// …) aren't found. Capture the login-shell PATH at startup and set it process-wide.
mod env_path;
// "Reveal in Finder" launcher — opens a workspace's project dir in the macOS
// Finder (`open <dir>`), alongside the Sublime Text / Merge launch buttons.
mod finder;
mod fs_index;
// QoL-WP0: filesystem watcher — per-workspace notify-debouncer-full watcher that
// emits debounced, gitignore-filtered `fs-change` events so the FileTree rail
// auto-refreshes and open editor docs live-reload on external on-disk changes.
mod fs_watch;
mod git_diff;
mod git_status;
// M3 WP2: register Claudesk's CC hook in ~/.claude/settings.json (additive,
// idempotent, reversible). The setup-hook install wiring lands in WP2 Phase 2.
mod hook_install;
// M3 WP3: AF_UNIX listener that receives the CC hook's JSON lines (the receive
// side of the status channel WP2's hook writes to). Phase 1 = the typed
// HookEvent + pure parse seam; Phase 2 binds the socket + accept-loop thread.
mod hook_socket;
// M5: Picture-in-Picture NSPanel — the out-of-focus workspace-status surface.
// Window mechanics (build/show/teardown) built on the WP1-confirmed (GO)
// tauri-nspanel contract; the React status surface loads at `pip.html`. See
// pip/mod.rs.
mod pip;
mod project_search;
// M3 WP4: status broadcaster — normalizes each HookEvent to a workspace state,
// maps cwd→open-workspace, and emits WorkspaceStatusUpdate on `workspace-status`.
// Phase 1 = the pure transform core + DTO + registry; Phase 2 drains WP3's receiver
// and wires the Tauri emit in `.setup()`.
mod status_broadcaster;
// M6 WP1: best-effort file telemetry for the status channel (stuck-`Running` dot
// probe) — readable from the launchd-launched prod `.app` where stderr is invisible.
mod status_log;
mod sublime;
// M9 WP2: time-analytics store (absorb claude-time) — the SECOND, gated consumer of
// the HookEvent stream. Pure schema/mapping in time_store/mod.rs; the per-identity
// SQLite connection holder + gated write + toggle hook-point in time_store/commands.rs.
// Phase 2 = the module + tests (dormant); Phase 3 fans the stream out to its drain.
mod time_store;
// M7: menu-bar (system-tray) status item — the ambient 2-state ALARM. A template
// tray glyph lit when ANY workspace is AwaitingInput, neutral otherwise. Subscribes
// to the existing M3 `workspace-status` broadcast (no broadcaster change). The pure
// `aggregate_alarm` fold lives in tray/mod.rs; the tray-icon ops in tray/commands.rs.
mod tray;

use std::sync::Mutex;

use tauri::{Emitter, Listener, Manager, WindowEvent};

use cc_session::SessionRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // M5: tauri-nspanel plugin — required for the NSPanel conversion the
        // `pip` module's PanelBuilder performs.
        .plugin(tauri_nspanel::init());

    // M5 WP2 (PROBE): the MCP bridge plugin drives the real WKWebView over a local
    // WebSocket so an agent UI-driver can mount + inspect a live workspace (the
    // adopt/reject probe for agent-side verify-self on status surfaces). DEV-ONLY:
    // registered under `debug_assertions` so it is wholly absent from `tauri build`
    // release binaries (the SURFACE-2026-06-23 hard requirement). `localhost_only()`
    // keeps the default 0.0.0.0:9223 bind on the loopback so the dev bridge never
    // exposes the webview on the LAN.
    #[cfg(debug_assertions)]
    {
        // `localhost_only()` is the constructor for a loopback-bound Config (the
        // default Config binds 0.0.0.0); it returns a Config, not a builder method.
        builder = builder.plugin(tauri_plugin_mcp_bridge::init_with_config(
            tauri_plugin_mcp_bridge::Config::localhost_only(),
        ));
    }

    builder
        // Native menu clicks: predefined items (Edit/Window/About/Quit) are handled
        // by macOS directly and never reach here; our custom items broadcast their id
        // on the `menu` event for the frontend bridge to act on (app_menu).
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            // M7 WP2: tray actuator items (Show Claudesk / Toggle PiP) are handled
            // backend-side and consume the event; everything else falls through to the
            // app_menu frontend bridge. (This closure fires for tray menu events too.)
            if tray::commands::handle_tray_menu_event(app, id) {
                return;
            }
            app_menu::handle_menu_event(app, id);
        })
        // WP7: the live CC sessions live here, reachable from the cc_* commands.
        .manage(Mutex::new(SessionRegistry::new()))
        // M5 WP5 Phase 2 (rework): the PiP auto-summon debounce bookkeeping (just the
        // pending-summon token; the regime is the persisted PipMode, read fresh). Mutated
        // by pip_set_mode + the main-window focus handler; read by the debounce timer.
        .manage(pip::PipAutoStateLock::default())
        // M7: the menu-bar tray state (built tray handle + per-workspace alarm map). Managed
        // before `init_tray` runs in setup so the `workspace-status` listener can reach it.
        .manage(tray::commands::TrayState::default())
        // M9 WP2.5: the active-context signal (which workspace/right-panel surface is
        // active) — set by the frontend's time_set_active_context, read by the focus
        // handler + keystroke path to attribute native-signal rows. Managed early so the
        // focus handler can reach it from the first Focused event.
        .manage(time_store::commands::init_active_context())
        // M3 WP2: register Claudesk's CC hook in ~/.claude/settings.json on launch
        // (deploy the bundled script to app-data, chmod +x, additive-merge the three
        // M3 events). Idempotent + additive + reversible (see hook_install). A
        // failure is surfaced, never swallowed (the WP6/WP7-M2 IPC-error lesson):
        // log to stderr AND emit `hook-install-error` so the frontend can toast it —
        // status would silently break otherwise.
        .setup(|app| {
            let handle = app.handle().clone();
            // GUI-PATH fix (2026-06-24): a Finder/Dock-launched app inherits the
            // minimal launchd PATH (/usr/bin:/bin:/usr/sbin:/sbin), so user-installed
            // CLIs (claude in ~/.local/bin, etc.) aren't found and `cc_spawn` fails
            // with "No viable candidates found in PATH". Capture the login-shell PATH
            // and set it process-wide — MUST run before any spawn below. Best-effort:
            // a capture failure leaves the inherited PATH untouched.
            env_path::apply_login_path_to_process();
            // Native application menu (the menu bar). Build + set app-wide (macOS
            // ignores per-window menus). A failure is surfaced, never swallowed — the
            // app would fall back to no/default menu, which we want to see in logs.
            match app_menu::build_menu(&handle) {
                Ok(menu) => {
                    if let Err(e) = app.set_menu(menu) {
                        eprintln!("[claudesk] set_menu failed: {e}");
                    }
                }
                Err(e) => eprintln!("[claudesk] build_menu failed: {e}"),
            }
            // Keep the View-menu PiP-mode checkmarks in sync with the backend. The three
            // CheckMenuItems are seeded once in build_menu, but the active mode changes at
            // runtime (icon button OR a menu click → pip_set_mode → `pip-mode` broadcast).
            // Re-check them on every broadcast so the radio always matches the persisted
            // mode (the single source of truth) — there is no menu-rebuild path.
            {
                let menu_handle = handle.clone();
                handle.listen(pip::commands::PIP_MODE_EVENT, move |event| {
                    match serde_json::from_str::<pip::layout::PipMode>(event.payload()) {
                        Ok(mode) => app_menu::apply_pip_mode_to_menu(&menu_handle, mode),
                        Err(e) => eprintln!(
                            "[claudesk] pip-mode menu sync: could not parse payload {:?}: {e}",
                            event.payload()
                        ),
                    }
                });
            }
            // Keep the View-menu CC permission-mode radio in sync with the backend. The
            // CheckMenuItems are seeded once in build_menu, but the value changes at runtime
            // (menu click / picker dropdown → cc_set_permission_mode → `cc-permission-mode`
            // broadcast). Re-check on every broadcast so exactly the active mode is checked
            // (single source of truth).
            {
                let menu_handle = handle.clone();
                handle.listen(
                    cc_session::commands::CC_PERMISSION_MODE_EVENT,
                    move |event| {
                        match serde_json::from_str::<cc_session::CcPermissionMode>(event.payload())
                        {
                            Ok(mode) => {
                                app_menu::apply_cc_permission_mode_to_menu(&menu_handle, mode)
                            }
                            Err(e) => eprintln!(
                                "[claudesk] cc-permission-mode menu sync: could not parse payload {:?}: {e}",
                                event.payload()
                            ),
                        }
                    },
                );
            }
            // Dev/prod isolation (2026-06-24): on a DEV build's first launch, seed
            // its projects.json from the prod list so dogfooding starts with the
            // operator's real projects. Best-effort + idempotent + no-op on prod.
            config_store::commands::seed_dev_projects_from_prod(&handle);
            if let Err(e) = hook_install::commands::install_on_launch(&handle) {
                eprintln!("[claudesk] hook install failed: {e}");
                let _ = handle.emit("hook-install-error", e);
            }
            // M3 WP4: the workspace registry the broadcaster maps each event's cwd
            // against. Empty at launch — WP6 wires workspace-open → register /
            // close → deregister; until then every event is dropped (no match), so
            // nothing is emitted. Managed before start_broadcaster so the drain
            // thread can read it via try_state.
            app.manage(status_broadcaster::commands::init_registry());
            // QoL-WP0: the filesystem-watcher registry (workspace_id → live debouncer).
            // Empty at launch — the frontend calls workspace_watch_start on open /
            // workspace_watch_stop on close (mirroring workspace_register/deregister).
            // Managed here so the start/stop commands can reach it via State.
            app.manage(fs_watch::commands::init_watcher_registry());
            // M3 WP3: bind the AF_UNIX listener that RECEIVES the hook's JSON lines
            // and spawn its accept-loop thread (the receive side of the status
            // channel WP2's hook writes to). A bind failure is surfaced, never
            // swallowed — status then defaults to Unknown, never PTY-inferred.
            match hook_socket::commands::start_on_launch(&handle) {
                Ok(state) => {
                    // M3 WP4: hand the held status-receiver to the status broadcaster's
                    // drain thread — it maps each event to a WorkspaceStatusUpdate and
                    // emits it on `workspace-status`. Take it out of the HookSocketState
                    // holder (the WP3→WP4 seam); a double-start (receiver already taken)
                    // is a bug, so we log and skip rather than panic.
                    match state.status_receiver.lock() {
                        Ok(mut guard) => {
                            if let Some(rx) = guard.take() {
                                status_broadcaster::commands::start_broadcaster(
                                    handle.clone(),
                                    rx,
                                );
                            } else {
                                eprintln!("[claudesk] status-broadcaster: hook receiver already taken; not starting drain thread");
                            }
                        }
                        Err(e) => eprintln!(
                            "[claudesk] status-broadcaster: could not lock hook receiver: {e}"
                        ),
                    }
                    // M9 WP2 Phase 3: the SECOND, gated consumer of the SAME fan-out
                    // stream — the time-analytics writer. Open the per-identity SQLite
                    // DB, manage it, and drain the time-receiver into it (write_gated,
                    // default OFF until WP5's toggle). INDEPENDENT of the status path:
                    // a DB-open failure is surfaced but must NOT take down the dots —
                    // if the store fails to open we simply don't start the writer, and
                    // the status broadcaster above is entirely unaffected.
                    match time_store::commands::open_and_bootstrap(&handle) {
                        Ok(store) => {
                            app.manage(store);
                            match state.time_receiver.lock() {
                                Ok(mut guard) => {
                                    if let Some(rx) = guard.take() {
                                        time_store::commands::start_writer(handle.clone(), rx);
                                    } else {
                                        eprintln!("[claudesk] time-store: time receiver already taken; not starting writer thread");
                                    }
                                }
                                Err(e) => eprintln!(
                                    "[claudesk] time-store: could not lock time receiver: {e}"
                                ),
                            }
                        }
                        // Surfaced, never fatal — the status path keeps working.
                        Err(e) => eprintln!(
                            "[claudesk] time-store: could not open analytics DB (writer not started, status unaffected): {e}"
                        ),
                    }
                    app.manage(state);
                }
                Err(e) => hook_socket::commands::emit_start_error(&handle, &e),
            }
            // M5 WP5 Phase 2 (rework): the persisted PiP MODE governs the panel at rest.
            // M6 WP9 Phase 2: we do NOT show the `On` panel here at launch — the registry is
            // always empty at launch (the frontend webview hasn't mounted, so no
            // `workspace_register` has fired), so an unconditional `On`-show would render an
            // EMPTY pinned panel (operator vh.4: "no PiP when there's nothing to mirror").
            // Instead, `On`-mode visibility is REACTIVE: the first `workspace_register` calls
            // `reconcile_pip_for_workspace_count`, which shows the pinned panel once ≥1
            // workspace is open (and hides it when the count returns to 0). So launch does
            // nothing here — `Auto`/`Off` rest hidden, and `On` rests hidden-until-first-open.
            //
            // M7: build the menu-bar tray item (neutral template glyph) and subscribe it to
            // the `workspace-status` broadcast so its glyph lights up when any workspace is
            // AwaitingInput. A build failure is surfaced, never swallowed (the IPC-error
            // discipline) — the app still runs, just without the ambient alarm.
            if let Err(e) = tray::commands::init_tray(&handle) {
                eprintln!("[claudesk] tray init failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_store::commands::list_projects,
            config_store::commands::add_project,
            config_store::commands::record_open,
            config_store::commands::remove_project,
            // WP9: prune projects whose folder was deleted between sessions.
            config_store::commands::prune_missing_projects,
            cc_session::commands::cc_spawn,
            // WP9: second-terminal panel — spawns the user's login shell (not claude)
            // into the same SessionRegistry; reuses cc_input/cc_resize/cc_kill.
            cc_session::commands::term_spawn,
            cc_session::commands::cc_input,
            cc_session::commands::cc_resize,
            cc_session::commands::cc_kill,
            // WP9: frontend-ready signal — flushes the pre-subscription output backlog
            // (closes the shell-prompt race where a shell's one-shot prompt emitted
            // before the frontend's listener attached).
            cc_session::commands::cc_ready,
            // Read/persist the CC permission mode (the friend-requested dropdown).
            // get seeds the picker dropdown + View-menu radio on mount; set persists +
            // broadcasts `cc-permission-mode` so both re-render. Read at spawn time →
            // takes effect next spawn.
            cc_session::commands::cc_get_permission_mode,
            cc_session::commands::cc_set_permission_mode,
            // WP8: Sublime Text pop. Invoked from the frontend right-panel button with
            // the focused workspace's path. PERMANENT (WP8 redefinition 2026-06-20) — the
            // in-app editor is the primary surface, but Sublime Text stays as a one-click
            // escape hatch (the ⌘⇧O keydown hotkey was dropped; the button is the sole
            // affordance now).
            sublime::commands::sublime_open,
            // WP5: Sublime Merge open. Permanent companion surface (NOT removed by
            // WP8) — staging/blame/history/blob-at-rev the inline diff viewer omits.
            sublime::commands::smerge_open,
            // Reveal-in-Finder: open the focused workspace's project dir in the
            // macOS Finder (`open <dir>`), the third tab-row launcher button.
            finder::commands::finder_open,
            // WP2: lite-editor file IO, confined to the workspace project root.
            // (write_file is exercised by the save keybinding in Phase 2.)
            editor_fs::commands::read_file,
            editor_fs::commands::write_file,
            // WP12: file disk-marker (mtime + size) for the tab strip's disk-change
            // detection — checked on tab-activate + pre-save to spot a file CC edited.
            editor_fs::commands::stat_file,
            // QoL-WP5: delete a single file under the workspace root (root-confined,
            // hard remove_file, no recursive directory delete). Create reuses write_file
            // (empty contents).
            editor_fs::commands::delete_file,
            // QoL-WP5b: move a path (file OR dir) under the workspace root to the macOS
            // Trash (root-confined, recoverable). Wired to folder-delete; the blast radius
            // of a recursive delete makes Trash the safe default over a hard remove_dir_all.
            editor_fs::commands::trash_path,
            // QoL-WP5b: create a directory (+ missing intermediates) under the workspace
            // root (root-confined via a parent-tolerant lexical guard, idempotent). Backs
            // the "new folder" affordance + the nested-file create's mkdir -p of the parent.
            editor_fs::commands::create_dir,
            // WP4: git diff viewer data (Sublime-Merge-style). The backend computes
            // the real git hunks + commit history; the frontend renders styled +/-
            // lines (no @codemirror/merge). (The superseded git_file_base command
            // from WP4's first attempt was removed in PB.7 once the old DiffPanel
            // that called it was deleted — tauri-command-removal-needs-invoke-sweep.)
            git_diff::commands::git_changed_files,
            git_diff::commands::git_file_hunks,
            git_diff::commands::git_recent_commits,
            git_diff::commands::git_commit_diff,
            // WP11: per-path working-tree status map for the file-tree row indicators
            // (Sublime-sidebar style). Reuses git_diff's git2 plumbing; a non-git
            // workspace returns an empty map (not an error) so the tree still renders.
            git_status::commands::git_file_statuses,
            // WP6: Cmd+P fuzzy file finder. Walks the workspace project dir honoring
            // .gitignore (ignore crate) and returns the file list the finder overlay
            // fuzzy-matches over. Errors surface to the overlay, never empty-on-fail.
            fs_index::commands::fs_index,
            // WP10: file-tree navigator. Same gitignore-honoring walk as fs_index but
            // returns files + directories (tagged) so the frontend can nest a tree.
            fs_index::commands::fs_tree,
            // WP7: project-wide content search ("Find in Files", ⌘⇧F overlay). Reuses
            // fs_index's `ignore` walker (one shared .gitignore contract with the
            // finder + tree) and matches per-line with the `regex` crate. Errors
            // (bad root, invalid regex) surface to the overlay, never empty-on-fail.
            project_search::commands::project_search,
            // WP7 Phase 3: project-wide Replace All — reuses the same composed regex +
            // shared walk as search, writes via editor_fs's atomic root-confined writer.
            project_search::commands::project_replace,
            // M3 WP2: remove Claudesk's CC hook from ~/.claude/settings.json (only
            // ours). Exposed for a future settings toggle / clean teardown. The
            // install runs once at launch (WP2 Phase 2 setup wiring), not via IPC.
            hook_install::commands::hook_uninstall,
            // M3 WP6: workspace-open → register the project path with the status
            // broadcaster's WorkspaceRegistry (so cwd→workspace matching resolves
            // hook events), workspace-close → deregister. The frontend invokes these
            // on open/close; until a path is registered the broadcaster drops every
            // event (no match) so nothing is emitted.
            status_broadcaster::commands::workspace_register,
            status_broadcaster::commands::workspace_deregister,
            // QoL-WP0: start/stop a per-workspace filesystem watcher. The frontend
            // invokes start on workspace-open (alongside workspace_register) and stop
            // on close; the watcher emits debounced, gitignore-filtered `fs-change`
            // events the FileTree + editor consumers subscribe to.
            fs_watch::commands::workspace_watch_start,
            fs_watch::commands::workspace_watch_stop,
            // M5 WP5 Phase 2 (rework): the PiP visibility MODE (Off/On/Auto) — the single
            // user-facing control. set persists + applies the side-effect + broadcasts
            // `pip-mode`; get seeds the icon button + View-menu radio on mount. Replaces
            // the old pip_toggle + pip_*_auto_summon (the inferred-regime dead-end).
            pip::commands::pip_get_mode,
            pip::commands::pip_set_mode,
            // M5 WP4: read/persist the PiP layout. set broadcasts `pip-layout` to all
            // webviews (PiP re-renders; main ticker gates serialize); get seeds the
            // PiP's layout on mount from the persisted value (app-settings store).
            pip::commands::pip_get_layout,
            pip::commands::pip_set_layout,
            // M5 WP4 Phase 3: content-driven panel resize — the PiP computes its size
            // (layout × workspace count, screen-capped + wrapped) and calls this to apply it.
            pip::commands::pip_resize,
            // M5 WP4 Phase 5: panel drag — the PiP tracks the pointer during a body drag and
            // calls this with each frame's (dx, dy); moves the swizzled panel via AppKit
            // setFrameOrigin: (the Tauri move path + movableByWindowBackground are both inert
            // on this borderless NonactivatingPanel — see pip_move's doc comment).
            pip::commands::pip_move,
            // M9 WP2.5: the frontend reports the active workspace + right-panel surface
            // (editor/diff/terminal) here on center-stage promote AND surface switch, so
            // the focus handler + keystroke path attribute native-signal rows to the
            // right workspace/surface (OQ1 + OQ4). Pure state-set; the WRITES it feeds are
            // gated on the tracking toggle.
            time_store::commands::time_set_active_context,
        ])
        .on_window_event(|window, event| {
            // M5 WP5 Phase 2 — auto-summon/dismiss state machine, driven by the MAIN
            // window's focus transitions (the Phase-1 probe proved the seam fires
            // reliably for cross-app blur + every return path, and that the
            // non-activating PiP show/hide does NOT itself emit a Focused event — so no
            // suppression guard is needed). Scoped to "main": the PiP panel is a separate
            // window whose events must not be read as main-window focus.
            if window.label() == "main" {
                if let WindowEvent::Focused(focused) = event {
                    // Quiet probe trail (was a temporary eprintln! in Phase 1; kept as a
                    // low-noise breadcrumb for live focus debugging).
                    eprintln!("[claudesk] focus-probe: main window focused={focused}");
                    pip::commands::pip_on_main_focus_changed(window.app_handle(), *focused);
                    // M9 WP2.5: record the focus/blur transition as a native-signal row,
                    // gated + attributed to the active context. Independent of the PiP
                    // path above — best-effort, zero-IO when the tracking gate is OFF
                    // (the WP2 default). Must not perturb focus handling or PiP.
                    time_store::commands::record_focus_change(window.app_handle(), *focused);
                }
            }
            // WP7 shutdown: kill every CC child on window close so we never leak an
            // orphaned `claude`. Backend-driven (robust against a frozen webview).
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(registry) = window.try_state::<Mutex<SessionRegistry>>() {
                    if let Ok(mut reg) = registry.lock() {
                        reg.kill_all();
                    }
                }
                // M3 WP3: unlink the hook socket on close (mirror the kill_all
                // reaping discipline). Belt to bind_listener's stale-file removal.
                if let Some(state) = window.try_state::<hook_socket::commands::HookSocketState>() {
                    hook_socket::commands::cleanup_socket(&state.socket_path);
                }
                // M5: tear down the PiP panel if it's open — otherwise the
                // all-Spaces/floating panel orphans on screen after the main window
                // closes. MUST go through to_window()→close(): the crate's
                // to_window() un-swizzles the NSPanel + sets released_when_closed
                // safely; closing the live panel object is a use-after-free abort
                // (tauri-nspanel #22).
                pip::commands::teardown(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(1 + 1, 2);
    }
}
