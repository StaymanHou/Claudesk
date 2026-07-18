---
stage: research
state: complete
updated: 2026-07-16
---

# Research

**Milestone Focus:** Milestone 10 — In-app auto-updater (check → download → install → relaunch, user-controlled: skip-version / disable-notifications / cancel-confirm; Homebrew detect-and-defer; stay-unsigned + minisign artifact verification).

> Two decisions are **already LOCKED** by the operator (2026-07-06) and are NOT re-litigated here — this pass researches the **HOW**:
> 1. **Homebrew → detect-and-defer** (brew installs point to `brew upgrade`; only direct-download installs self-update).
> 2. **Signing → stay UNSIGNED, no $99 Apple Developer Program.** Use the updater's free minisign keypair for artifact verification; handle the unsigned-Gatekeeper relaunch.

---

## Recommended Stack

- **`tauri-plugin-updater` v2** — the official Tauri 2 updater. Confirmed current + the right primitive. Provides `check()` → `Option<Update>`, then either `update.downloadAndInstall(onProgress)` or split `update.download()` / `update.install()`. Progress callback emits `{event: 'Started'|'Progress'|'Finished', data: {contentLength?, chunkLength?}}` — this is the seam for a **download progress bar + a cancel affordance** (cancel = don't call `install()`, or abort the download future; there is no dedicated cancel API — cancellation is "stop before install", which satisfies the operator's "cancel leaves the current version untouched" because install/replace only happens on `install()`).
- **`tauri-plugin-process` v2** — required for the **relaunch** after install (JS `relaunch()` from `@tauri-apps/plugin-process`; Rust side can use `app.restart()` on the `AppHandle` directly). Confirmed the JS relaunch path needs this plugin.
- **minisign (via `tauri signer generate`)** — free, no Apple account, Ed25519. Generates a keypair; the **public key goes in `tauri.conf.json` → `plugins.updater.pubkey`**; each release artifact is signed → a `.sig` whose contents paste into the manifest's `signature` field. The private key stays secret (a repo secret / local keychain; NOT committed).
- **Update endpoint = a static `latest.json` on GitHub Releases.** Tauri supports a static-JSON endpoint (e.g. `https://github.com/StaymanHou/Claudesk/releases/latest/download/latest.json`). No server needed — fits the "no backend infrastructure" project constraint. `/release` already creates the GitHub release; it gains manifest + `.sig` uploads.

### `latest.json` manifest shape (confirmed)
```json
{
  "version": "0.3.0",
  "notes": "…",
  "pub_date": "2026-…T…Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<contents of the .app.tar.gz.sig>",
      "url": "https://github.com/StaymanHou/Claudesk/releases/download/v0.3.0/Claudesk_0.3.0_aarch64.app.tar.gz"
    }
  }
}
```
Required keys: `version`, `platforms.[target].url`, `platforms.[target].signature`. `notes`/`pub_date` optional. **Target key for Claudesk = `darwin-aarch64`** (Apple-Silicon-only, matching the current single `.dmg` target). Endpoint templating supports `{{target}}`/`{{arch}}`/`{{current_version}}` but a single static `latest.json` is simplest for one platform.

### Build artifacts (the `/release` gap)
With `bundle.createUpdaterArtifacts: true` in `tauri.conf.json`, `pnpm tauri build` additionally emits (in `target/release/bundle/macos/`):
- `Claudesk.app.tar.gz` — the **updater bundle** (the updater downloads + extracts this, NOT the `.dmg`)
- `Claudesk.app.tar.gz.sig` — its minisign signature

**Today `/release` builds + publishes ONLY the `.dmg`** (Explore-confirmed: `.claude/skills/release/SKILL.md`). The updater path needs a **second artifact class** (`.app.tar.gz` + `.sig`) published to the GitHub release, plus the generated `latest.json`. The `.dmg` stays (it's the first-install / Homebrew artifact); the `.app.tar.gz` is the update artifact. Two distribution artifacts, one release.

---

## The three HARD problems (and their answers)

### A. Unsigned-relaunch Gatekeeper quarantine — the load-bearing UX risk
**Problem:** the updater downloads `Claudesk.app.tar.gz`, extracts, and **replaces the running `.app` in place**, then relaunches. Because Claudesk is unsigned/un-notarized, the freshly-written bundle is subject to Gatekeeper. Research consensus: a re-downloaded/replaced unsigned bundle is blocked as **"damaged / cannot be opened"** on launch unless quarantine is cleared. Today `/release` mitigates first-install via the cask `caveats` + the manual `xattr -dr com.apple.quarantine` step — the updater must solve the *equivalent* for the post-update relaunch.

**Key finding (favorable):** the quarantine `com.apple.quarantine` xattr is applied by the **downloading agent** (browser/curl set it; LaunchServices enforces it). An app writing files **programmatically via its own process does not automatically get quarantine applied the same way** — BUT `tauri-plugin-updater`'s download uses an HTTP client whose bytes land on disk, and macOS *may* still flag the replaced bundle. The safest posture (and the operator's locked expectation) is: **the updater self-clears quarantine on its own freshly-installed bundle before relaunch.**

**Recommended mechanism (validate at WBS/spike):** after `install()` extracts the new `.app` but before `relaunch()`, run `xattr -dr com.apple.quarantine <path-to-own-bundle>` from within the app (a `std::process::Command` on the app's own bundle path — the app can write to its own bundle since it's running from it and owns it). This is **self-service quarantine clear** — no user terminal step, no `sudo` (clearing your *own* bundle doesn't need sudo; `sudo` is only in the docs for clearing an app you don't own). **Fallback if self-clear proves unreliable** (e.g. install() relaunches before a hook can fire): surface the exact `xattr` command in a post-update dialog for the user to run — the operator-accepted worst case. **This is the #1 spike item — it must be proven on a real unsigned installed build before the milestone is trusted** (per the installed-build smoke-test convention; a dev build won't reproduce Gatekeeper).

### B. Homebrew detect-and-defer — install-source detection at runtime
**Problem:** a brew-cask install that self-updates desyncs `brew` (brew keeps recording the old version; a later `brew upgrade` could downgrade — memory `[[brew-cask-manual-delete-desync]]`). So the updater must **detect a brew-managed install and NOT self-install** — instead point the user to `brew upgrade`.

**Detection mechanism (confirmed reliable):** Homebrew casks install the real bundle under `<brew-prefix>/Caskroom/<cask>/<version>/Claudesk.app` and place `/Applications/Claudesk.app` as a **symlink** to it (standard `app` stanza behavior). A **direct-download / `.dmg`-dragged** install is a **real directory** at `/Applications/Claudesk.app` (no Caskroom in its resolved path). So at runtime:
- Resolve the running bundle's **canonical path** (`std::env::current_exe()` → walk up to the `.app`, then `canonicalize()` / `realpath` to follow symlinks).
- If the resolved path contains `/Caskroom/` (or, more precisely, is under `brew --caskroom`) → **brew-managed → defer** (show "installed via Homebrew → run `brew upgrade`", do NOT self-install).
- Otherwise → **direct-download → self-update allowed.**
- Belt-and-suspenders alternative / supplement: **bake an install-source marker at release time** — a file the `.dmg` bundle carries (e.g. `Contents/Resources/install-source=direct`) vs. absent/different for the cask. The path-resolution check is simpler and needs no release-time change; the marker is the fallback if path detection is fragile. **Decide at WBS** — lead with path-resolution (Caskroom detection).

### C. User-control UX (skip / disable-notifications / cancel-confirm) + persistence
Maps cleanly onto the plugin API + the existing settings pattern:
- **Check + notify:** call `check()` on launch (gated by the disable-notifications pref) and/or on-demand ("Check for updates…" menu item / settings button). A non-modal notification when an update exists AND its version isn't in the skip list.
- **Skip this version:** persist a `skipped_version: String` (the exact version tag). `check()` still returns it, but the notify layer suppresses it. Manual "check now" ignores the skip (shows it again on explicit request).
- **Disable notifications:** a `update_notifications_enabled: bool` setting (default ON). OFF → no automatic `check()`-on-launch + no proactive notify; a manual "check now" still works.
- **Cancel / confirm:** the flow is check → (notify) → user confirms → `download()` (progress bar) → `install()` → `relaunch()`. **Cancel before `install()` = no change** (the running app is untouched until install extracts+replaces). Confirm is an explicit dialog; never silent, never forced.
- **Persistence:** store both prefs in the existing `config_store` settings (the same file/pattern as `time_tracking_enabled` (M9) and `pip_mode`), **per bundle-identity** (`com.claudesk.app` vs `.dev`) so dev and prod don't cross-contaminate — consistent with the established isolation.

---

## Trade-offs

- **Static `latest.json` on GitHub Releases** vs a dynamic endpoint: static is zero-infra and fits the single-user/no-backend constraint, at the cost of no per-user gating / staged rollout (irrelevant here). **Chosen: static.**
- **Self-clear quarantine** vs **instruct-the-user**: self-clear is the better UX but must be proven on a real unsigned build (risk it fires too late / is blocked). Instruct-the-user always works but is a papercut. **Lead with self-clear, keep instruct-the-user as the guaranteed fallback.**
- **Path-resolution brew detection** vs **baked marker**: path-resolution needs no release change and is reliable for the standard cask symlink layout; the marker is more explicit but adds a release step. **Lead with path-resolution.**
- **`.app.tar.gz` as a second artifact** vs replacing the `.dmg`: the `.dmg` must stay (first-install + Homebrew). Accept **two artifacts per release** — a small `/release` complication, not a redesign.
- **`downloadAndInstall()` (combined)** vs **split `download()`/`install()`**: split gives a cleaner cancel boundary (cancel between download and install) and a progress bar. **Lean split** for the cancel-confirm UX.

---

## Risks

1. **[HIGH — the milestone's central risk] Unsigned post-update relaunch is a silent Gatekeeper failure.** If self-clear doesn't work and the user isn't shown the `xattr` step, the app "breaks on update" — the worst possible outcome for an *update* feature. **Mitigation: a mandatory spike on a REAL unsigned installed build (not `tauri:dev`) proving the extract→self-xattr-clear→relaunch path opens clean. This spike gates the WBS.** (Installed-build smoke-test convention applies with force.)
2. **Updater on unsigned macOS may hit issues Tauri assumes signing solves.** The Tauri docs don't mark signing as strictly required for the updater to *function*, but most macOS updater guidance assumes signed+notarized. There may be edge cases (the in-place replace, the relaunch handoff) that only bite unsigned builds. Spike de-risks.
3. **Brew-install detection false-negative** → a brew install self-updates → brew desync (`[[brew-cask-manual-delete-desync]]` territory). Mitigate with the path-resolution check + verify against the *actual* Claudesk cask symlink layout on a real brew install; keep the baked-marker fallback.
4. **`current_exe()` / bundle-path resolution edge cases** (running from a translocated path — macOS App Translocation randomizes the path for quarantined apps launched from a `.dmg`/Downloads). Translocation could confuse both the brew-detection AND the self-xattr path. Spike must run from a *properly installed* `/Applications` bundle, not a translocated one.
5. **Two version-source-of-truth files** (`tauri.conf.json` + `Cargo.toml`) already must stay in sync at release; the manifest adds a third place the version appears (`latest.json`). `/release` automation must derive all from one source to avoid drift.
6. **First updatable release is the FLOOR, not retroactive.** The updater can only update *from* a build that already contains it. The next release (M10 output) is the first that later versions update from; there is no updating the currently-installed v0.2.x via this mechanism (they still `brew upgrade` / re-download once). Not a defect — inherent, and matches the roadmap's "must ship before the next release" placement.

---

## Roadmap impact

**None — the roadmap holds.** Research validates the locked decisions and the `tauri-plugin-updater` + `tauri-plugin-process` impl leaning; it refines *how* (static `latest.json` on GH releases, Caskroom-path brew detection, self-xattr-clear-then-relaunch with an instruct-the-user fallback, split download/install for cancel). No deliverable changes; no re-sequencing. Proceed to `/product-arch` (the updater adds an architectural element — the update-artifact/manifest/signing pipeline + the install-source-detection + self-quarantine-clear mechanisms — worth an arch note) then `/product-wbs`. **One WBS-shaping mandate surfaced: a Risk-1 spike (unsigned installed-build extract→self-clear→relaunch) must be the FIRST work package — it gates whether the self-clear UX is viable or the milestone falls back to instruct-the-user.**

---

## References

- Tauri v2 Updater plugin (official): https://v2.tauri.app/plugin/updater/
- Updater manifest / minisign / `signer generate` (Tauri docs, v2 branch): https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/plugin/updater.mdx
- Tauri v2 auto-update walkthrough (GitHub releases + latest.json): https://thatgurjot.com/til/tauri-auto-updater/
- Tauri v2 updater + GitHub (Ratul): https://ratulmaharaj.com/posts/tauri-automatic-updates/
- Verify auto-updates locally (signature + latest.json setup): https://zenn.dev/monkuma/articles/c947bca541cb48?locale=en
- Unsigned macOS Gatekeeper / `xattr` handling (indie dev): https://dev.to/hiyoyok/handling-macos-gatekeeper-as-an-unsigned-indie-dev-the-xattr-struggle-1028
- Gatekeeper "app is damaged" = quarantine, not corruption: https://blog.margrop.net/en/post/macos-gatekeeper-unsigned-app-fix/
- Tauri issue — app cannot be opened after macOS update (signing/quarantine): https://github.com/tauri-apps/tauri/issues/1883
- Shipping a production macOS Tauri 2 app (signing/notarization/Homebrew context): https://dev.to/massi_24/shipping-a-production-macos-app-with-tauri-20-code-signing-notarization-and-homebrewpublished-o10
- Homebrew Cask Cookbook (cask install layout / Caskroom): https://docs.brew.sh/Cask-Cookbook
- Homebrew FAQ (Caskroom + /Applications symlink behavior): https://docs.brew.sh/FAQ
