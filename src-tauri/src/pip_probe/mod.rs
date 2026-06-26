//! M5 WP1 — THROWAWAY NSPanel probe.
//!
//! This module is a temporary probe scaffold, NOT production code. Its sole
//! purpose was to prove `tauri-nspanel` v2.1 can create the always-on-top,
//! all-Spaces, non-activating NSPanel the M5 PiP needs — and to surface the
//! exact working API shape so WP3 builds against confirmed calls. **VERDICT: GO.**
//!
//! The full verdict + the WP3 must-follow constraints are in `docs/product/wbs.md`
//! → "Probe outcomes". On GO this module is the seed for WP3's real `pip` module.
//!
//! Behaviors this panel asserts (verified live at verify-human — AppKit-level,
//! not agent-observable in a plain browser):
//!   - **non-activating** (a click never steals focus) → the `NonactivatingPanel`
//!     STYLE MASK on a born-borderless window. NOTE: do NOT use `.no_activate(true)`
//!     — it flips the global activation policy and hides the main window; the probe
//!     proved the style mask is the correct lever (see `commands.rs`).
//!   - `PanelLevel::Floating` → floats above normal windows.
//!   - `CollectionBehavior { can_join_all_spaces, stationary }` → visible on every
//!     Space, pinned. (`full_screen_auxiliary` is also set but over-fullscreen draw
//!     was DROPPED as a requirement — the flag is harmless, not a validated need.)

pub mod commands;
