//! M10 — In-app auto-updater.
//!
//! Claudesk is **Developer-ID signed and Apple-notarized** (M14 WP2, 2026-09-18 —
//! this REVERSED the M10 "stay unsigned + minisign" decision). A notarized bundle
//! carries a stapled ticket, so Gatekeeper admits a freshly-installed `.app` without
//! any quarantine handling: `spctl -a` reports `source=Notarized Developer ID`.
//!
//! ⚠️ **The self-quarantine-clear mechanism this module used to own is DELETED.**
//! `resolve_bundle_path`, `quarantine_clear_command`, `clear_own_quarantine`, the
//! `UpdaterError` enum and the `xattr` spawn are all gone — they existed *only*
//! because the bundle was unsigned. Do not reintroduce them; if a Gatekeeper block
//! ever reappears, the cause is a broken notarization/stapling step in `/release`
//! (see its steps 3b–3d), not a missing xattr clear.
//!
//! ⚠️ **minisign is RETAINED and is a different system.** It verifies the *updater
//! payload* inside `download()` (the downloaded buffer vs the configured `pubkey`),
//! while notarization satisfies *Gatekeeper*. The trust anchor `774E2E8429FDF78A`
//! is unchanged since v0.2.9 — changing it strands every existing install.
//!
//! ## The macOS install() seam (established by the WP1 probe, reading
//! ## `tauri-plugin-updater-2.10.1` source; do not re-derive)
//! - macOS `Update::install()` extracts the new `.app`, backs up the current one,
//!   moves the new bundle into `extract_path` (the resolved `/Applications/<app>.app`
//!   root), `touch`es it, and **returns `Ok(())` WITHOUT relaunching** (unlike the
//!   Windows path, which `std::process::exit(0)`s). So on macOS `install()` hands
//!   control back before the explicit `relaunch()` (tauri-plugin-process).
//! - minisign verification happens INSIDE `download()` (over the downloaded buffer
//!   vs the configured pubkey); a wrong/tampered signature fails `download()` before
//!   any install — also the cancel-safe boundary (cancel = don't call `install()`).
//! - `install()` only escalates to an admin AppleScript prompt when the initial
//!   in-place `rename` hits `PermissionDenied` — a user-owned `/Applications` bundle
//!   renames fine, so no admin prompt on the normal direct-download path.
//!
//! ## Layout
//! - **[`commands`]** — the Tauri commands driving the production update flow
//!   (`updater_check` + `updater_apply`).
//!
//! ## One self-update path — no install-source gate (M10 WP6 Phase B1, decision reversal)
//! An earlier WP3 iteration classified the install source (`/Caskroom/` → Homebrew) and
//! made brew installs DEFER to `brew upgrade` instead of self-updating. That decision was
//! **reversed** (2026-07-17, `SURFACE-2026-07-17-M10-BREW-DECISION-REVERSED-TO-SELF-UPDATE`):
//! brew installs now self-update in-app exactly like a direct download. The cask declares
//! `auto_updates true` and each release bumps `CFBundleVersion`, so a later `brew upgrade`
//! reconciles via `Info.plist` (Homebrew PR #21882) rather than downgrading. Consequently
//! the `InstallSource` enum + `install_source*` fns + the brew short-circuit/refusal were
//! removed here and in `commands` — there is ONE self-update path for every install.

pub mod commands;
