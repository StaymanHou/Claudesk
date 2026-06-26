//! M5 — Picture-in-Picture (PiP) NSPanel: the out-of-focus workspace-status surface.
//!
//! A small always-on-top floating panel the user can summon when the Claudesk
//! window is out of focus, mirroring the same status surface as the filmstrip.
//! Display-only in v1 (clicking a tile does NOT promote a workspace — vision
//! anti-goal). One window, many workspaces: the PiP is an auxiliary NSPanel, not a
//! second Claudesk window.
//!
//! This module owns the **window mechanics** — building the NSPanel with the exact
//! collection behavior the PiP needs and tearing it down safely. The panel's
//! content (the React status surface at `pip.html`) is the frontend's concern.
//!
//! The window contract below was proven viable by the M5 WP1 probe (VERDICT: GO —
//! see `docs/product/archive/.../wbs.md` "Probe outcomes → WP1"); WP3 builds the
//! real surface on it. Each behavior is verified, not assumed:
//!   - **non-activating** (a click never steals focus) → the `NonactivatingPanel`
//!     STYLE MASK on a born-borderless window. NOTE: do NOT use `.no_activate(true)`
//!     — it flips the global activation policy and hides the main window; the probe
//!     proved the style mask is the correct lever (see `commands.rs`).
//!   - `PanelLevel::Floating` → floats above normal windows.
//!   - `CollectionBehavior { can_join_all_spaces, stationary }` → visible on every
//!     Space, pinned. (`full_screen_auxiliary` is also set but over-fullscreen draw
//!     was DROPPED as a requirement — the flag is harmless, not a validated need.)

pub mod commands;
