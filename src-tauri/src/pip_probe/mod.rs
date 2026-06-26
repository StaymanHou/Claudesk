//! M5 WP1 — THROWAWAY NSPanel probe.
//!
//! This module is a temporary probe scaffold, NOT production code. Its sole
//! purpose is to prove `tauri-nspanel` v2.1 can create the always-on-top,
//! all-Spaces, over-fullscreen, non-activating NSPanel the M5 PiP needs — and
//! to surface the exact working API shape so WP3 builds against confirmed calls.
//!
//! The probe verdict (GO/NO-GO + API shape) is recorded in
//! `docs/product/wbs.md` → "Probe outcomes" at verify-codify. On GO this module
//! becomes the seed for WP3's real `pip` module; on NO-GO it is torn down.
//!
//! Behaviors this panel asserts (verified manually at verify-human — they are
//! AppKit-level and not agent-observable in a plain browser):
//!   - `no_activate(true)` + NonactivatingPanel style → click never steals focus
//!   - `PanelLevel::Floating` → floats above normal windows
//!   - `CollectionBehavior { can_join_all_spaces, full_screen_auxiliary,
//!     stationary }` → visible on every Space, draws over fullscreen apps, pinned

pub mod commands;
