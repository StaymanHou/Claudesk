---
stage: wbs
state: complete
milestone: 10
updated: 2026-07-17  # M10 WP4 (user-control UX + persistence) SHIPPED (commit `ee7bad7`) — config_store prefs (update_notifications_enabled default-ON + skipped_version, get/set/broadcast) + real download-progress event + pure FE gating (shouldAutoNotify/manualCheckOutcome, Q1 FE-side filter) + non-modal IN-FLOW banner (F12 misclick fix) / confirm / progress-bar / WP1-fallback dialog via useUpdater hook + "Check for Updates…" app-menu item + picker toggle/button; throwaway UpdaterTrigger deleted. 547 lib + 6 integ, FE 105 files/1154, clippy/tsc/eslint/vite-build clean; banner+flow+picker driven LIVE via MCP bridge. review-quality 0C/1M/3m all auto-backlogged (MAJOR error-surface gap → WP6 fold). 4/6 WPs done (WP2, WP3, WP4, WP5). Remaining: WP6 (milestone-exit verify). Local/uncommitted-to-remote. | M10 WP5 (/release publishing pipeline) SHIPPED (commit `5a72738`) — fresh release-only minisign keypair minted (out-of-repo ~/.claudesk-release-keys/, key id 774E2E8429FDF78A) + tauri.conf.json pubkey swap probe→fresh; /release skill gains signing-env-export (string-not-path) + latest.json gen (sig verbatim) + 4-asset upload + endpoint check + key-handling/FLOOR docs; end-to-end dry-run proof (manifest-sig→configured-pubkey→VERIFY_OK/FAIL); review-quality 0C/2M/1m all resolved in-place; real live publish + installed-build self-update DEFERRED→WP6 (uses the FRESH key). 3/6 WPs done (WP2, WP3, WP5). Remaining: WP4 (UX) → WP6 (exit). Local/uncommitted-to-remote (batched M10 tree, commit-only-when-asked). | M10 WP3 (brew detect-and-defer gate) SHIPPED — install_source() /Caskroom/ component-match + updater_check/updater_apply short-circuit to `brew upgrade` for brew installs; 15 updater tests; real-brew detection DEFERRED→WP6.
---

# WBS — Milestone 10: In-app auto-updater

**Scope of this WBS pass:** Milestone 10 only (the immediate next execution milestone). Future milestones (M10.5 QoL bucket, M11 docs-viewer, M12 auto-resume, M13 skill-orch, M14 polish) stay headline-only in `roadmap.md` and are decomposed just-in-time when reached.

**Milestone goal (from roadmap.md):** Claudesk checks for updates and downloads/installs a newer version from inside the app, with the user always in control — **skip a version, disable update notifications, cancel/confirm each install** (no silent/forced updates). Placed after M9 and **before the next release** because it governs how future versions reach users. See `roadmap.md` → "Milestone 10" + "Revision 2026-07-06".

**Primary inputs:** `research.md` (M10 — stack + the 3 hard problems resolved) + `arch.md` → "Milestone 10 architecture" (as-designed mechanisms). `SURFACE-2026-07-06-M10-IN-APP-AUTO-UPDATER`.

## Locked decisions (constraints, not choices — operator, 2026-07-06)

1. **Homebrew → detect-and-defer.** A brew-managed install does NOT self-install — it points the user to `brew upgrade`; only direct-download installs self-update in-app (no brew version desync). WP3 owns the detection mechanism.
2. **Signing → stay UNSIGNED, no $99 Apple Developer Program.** The updater's free **minisign** keypair verifies artifacts; macOS *notarization* is NOT purchased. Consequence: the unsigned-relaunch Gatekeeper block is handled in-app (WP1 probe → self-clear or instruct-user).

## Design-prior consult (Step 0)

Two recorded priors bear on the M10 UX WP boundaries — both **agree with the common-sense default (rule 2: take, higher confidence)**, neither fires as a tie-break or contradiction:
- **`operator-helpful-friend-misfiring-as-offswitchable-setting`** → `update_notifications_enabled` is exactly this shape: **default ON** (operator benefit), off-switchable (a friend who dislikes update nags turns it off). Confirms WP4's default-ON design.
- **`explicit-selectable-mode-over-inferred-mode`** (esp. its **risk-surface-vs-value** decision rule) → keep the M10 UX **low-surface**: plain confirm dialogs + a skip-list + a boolean pref, NOT an elaborate update-preferences panel; and its risk calculus backs **front-loading the WP1 spike** to resolve the high-bug-surface unsigned-relaunch unknown cheaply before the UX commits.

No new design prior surfaced to capture (the WP boundaries are dependency/risk-driven, not a product-design lean).

---

## Work Packages

### WP1: Probe — unsigned-relaunch self-quarantine-clear (the central risk; GATES the rest)
**Type:** probe
**Milestone:** 10
**Dependencies:** none (front-loaded)
**Size:** M
**Learning objective:** On a **real unsigned installed `.app`**, does the updater path `createUpdaterArtifacts` build → minisign-verify → `install()` extract/replace → **self-run `xattr -dr com.apple.quarantine <own bundle>`** → `relaunch()` open **clean** (no Gatekeeper "damaged" block)? If not, is the **instruct-the-user** dialog fallback the required UX? Settle the **App-Translocation** caveat (must run from a properly-installed `/Applications` bundle, not a translocated one).
**Timebox:** 1–1.5 days (includes 2 real builds — a "from" version and a "to" version — and a minisign keypair).
**Success criterion:** a documented **GO / FALLBACK verdict** in `wbs.md` "Probe outcomes": either (a) **GO** — self-clear-then-relaunch opens clean, seamless UX viable; or (b) **FALLBACK** — self-clear insufficient, M10 ships the instruct-the-user quarantine dialog. Plus: confirmed whether `install()` even permits a pre-relaunch hook (does it relaunch synchronously?), and the App-Translocation behavior for a `/Applications` install.
**Tasks:**
- [ ] Generate a minisign keypair (`tauri signer generate`); set the pubkey in `tauri.conf.json` `plugins.updater.pubkey`; store the private key locally (NOT committed).
- [ ] Enable `bundle.createUpdaterArtifacts: true`; build TWO unsigned versions (e.g. 0.2.5 "from" + a bumped "to"), each producing `.app.tar.gz` + `.sig`; sign + hand-author a `latest.json`.
- [ ] Install the "from" build to `/Applications` as a real (non-brew, non-translocated) bundle; host `latest.json` + the "to" artifact somewhere the updater can reach (local static server or a scratch GH pre-release).
- [ ] Drive the full path from the installed "from" app: `check()` → `download()` → `install()` → attempt self-`xattr`-clear on its own bundle → `relaunch()`. Observe: does it relaunch into the "to" version, or hit the Gatekeeper "damaged" block?
- [ ] Determine WHERE the self-clear must run (before `install()` relaunches vs. a `RunEvent`/pre-relaunch hook) and whether it needs the app to spawn a detached helper. Record the exact working sequence (or the fallback verdict).
- [ ] Write the GO/FALLBACK verdict + the working mechanism to "Probe outcomes"; note any reshaping of WP2/WP4.

### WP2: Updater core — plugin wiring + check→download→install→relaunch flow ✅ SHIPPED 2026-07-17 (uncommitted — batched on the unpushed M9+M10 tree, HEAD `27743ff`)
**Description:** Add the updater engine and the minimal working update path (no UX polish, no brew gate yet). `tauri-plugin-updater` v2 + `tauri-plugin-process` deps; `tauri.conf.json` `plugins.updater` block (pubkey from WP1 + the static `latest.json` GH-Releases endpoint); the Rust/JS flow using the **split `download()` then `install()`** (for the cancel boundary) + `relaunch()`; wire minisign verification; fold in WP1's self-clear (or fallback) mechanism at the correct point in the flow.
**Milestone:** 10
**Dependencies:** WP1 (the self-clear verdict shapes where/whether the xattr step sits in `install()→relaunch()`)
**Size:** M
**As-built:** production `src-tauri/src/updater/` module — `mod.rs` (self-clear pure-core `resolve_bundle_path`/`quarantine_clear_command`/`clear_own_quarantine` + 6 tests, MIGRATED intact from the WP1 probe; `UpdaterError`) + `commands.rs` (`updater_check` → `UpdateCheckResult`; `updater_apply` = full `check → download[minisign] → install → clear_own_quarantine → app.restart()`, self-clear at the WP1-frozen seam AFTER install() returns / BEFORE relaunch, split download/install for WP4's cancel boundary). Minimal THROWAWAY trigger `src/updater/UpdaterTrigger.tsx` (check → bare inline confirm → apply; WP4 replaces with the polished UX). WP1 probe scaffolding (`updater_probe/` + `UpdaterProbePanel`) removed. Deps/config/capabilities were already production-shaped from WP1 (no drift). Live verify-self via MCP bridge: widget renders + `updater_check` IPC round-trip fires (returns expected "no latest.json published yet" error — WP5's job). Destructive download→install→relaunch + Gatekeeper self-clear carried to WP6 (operator-deferred, SURFACE-2026-07-17-M10-WP1-LIVE-VERIFY-DEFERRED). Review-quality: 0 CRIT / 0 MAJOR / 3 MINOR (doc-drift, auto-backlogged).
**Tasks:**
- [x] Add `tauri-plugin-updater` + `tauri-plugin-process` to `Cargo.toml` + register in the Tauri builder; add the JS `@tauri-apps/plugin-updater` + `plugin-process`. (already in place from WP1; verified no drift)
- [x] `tauri.conf.json` `plugins.updater` { pubkey, endpoints: [static latest.json on GH Releases] }; `bundle.createUpdaterArtifacts: true`. (already in place from WP1; verified)
- [x] Implement the core flow (Rust command(s) + a thin frontend caller): `check()` → returns update-available (version, notes); `download()` (with the progress callback surfaced); `install()`; the WP1 self-clear step; `relaunch()`.
- [x] Verify minisign rejection: a tampered/wrong-key artifact fails verification (don't install). (re-proven via the WP1 verify-harness: VERIFY_OK real / VERIFY_FAIL tamper / VERIFY_FAIL wrong-sig)
- [x] Unit/wiring tests where the seam allows (the network + install are live-only → carried to WP6 installed-build verify). (6 self-clear pure-core tests pin the durable core; live flow carried to WP6)

### WP3: Install-source detection — the brew detect-and-defer gate ✅ SHIPPED 2026-07-17 (uncommitted — batched on the unpushed M9+M10 tree, HEAD `2592b2d`)
**Description:** Detect whether the running bundle is Homebrew-managed and gate self-update accordingly. Resolve the canonical bundle path (`current_exe()` → `.app` → `canonicalize()`); a `/Caskroom/` segment ⇒ **brew-managed ⇒ defer** (surface "installed via Homebrew → run `brew upgrade`", do NOT self-install); a real `/Applications` dir ⇒ **direct-download ⇒ self-update allowed**. Baked-marker fallback if path-resolution proves fragile.
**Milestone:** 10
**Dependencies:** WP2 (gates the WP2 flow — a pure decision function feeding the check/notify path; parallelizable with WP4 once WP2 lands)
**Size:** S
**As-built:** `src-tauri/src/updater/mod.rs` — `InstallSource {Homebrew, DirectDownload}` enum + PURE `install_source_from_bundle(Option<&Path>) -> InstallSource` (bounded `/Caskroom/` **path-component** match via `Path::components()`, NOT a substring — false-positive-guarded; `None`/unresolved ⇒ `DirectDownload` safe default) + thin `install_source()` resolver (`current_exe()` → `resolve_bundle_path` [reused from WP2 self-clear core] → `canonicalize()` [resolves the /Applications→Caskroom symlink] → the pure fn). Gate in `src-tauri/src/updater/commands.rs`: `install_source: String` field on `UpdateCheckResult`; `updater_check` short-circuits BEFORE the network `check()` for Homebrew (returns `brew upgrade` defer status + no available version); `updater_apply` refuses (belt-and-suspenders) before any download/install for Homebrew; shared `BREW_DEFER_MSG` const (check-status ≡ apply-refusal). Frontend `UpdaterTrigger.tsx`: `install_source` field + `isBrew` state + defer note (WP4-replaceable seam). Also folded the 2 WP2 doc-drift MINOR findings (stale WP1-probe comments in lib.rs invoke-handler + Cargo.toml dep comment → production wording). 15 updater tests (7 install_source path-shape incl. arm64/intel + 2 substring guards + translocation, 3 command, 5 pre-existing self-clear); full suite 539 lib + 6 integ + 1120 FE green; clippy --all-targets 0-warn. Live verify-self via MCP bridge: dev binary classifies DirectDownload (both commands reach `updater.check()`, NOT the brew short-circuit) → gate does not regress the direct-download flow. review-quality: 0 CRIT / 0 MAJOR / 3 MINOR (documentary/cosmetic, auto-backlogged). **Real brew `/Caskroom/` positive detection + App-Translocation observation DEFERRED-to-WP6** (needs a real brew install of an updater-capable build → needs WP5's pipeline; operator-approved "defer" 2026-07-17; `SURFACE-2026-07-17-M10-WP3-BREW-DETECTION-LIVE-DEFERRED`).
**Tasks:**
- [x] Pure Rust fn `install_source() -> {Homebrew, DirectDownload}` from the canonicalized bundle path (`/Caskroom/` check); unit-test both path shapes. (bounded component match; 7 path-shape tests)
- [x] Wire the gate: brew-managed ⇒ the update flow short-circuits to a "run `brew upgrade`" affordance (no `download()`/`install()`); direct-download ⇒ normal flow. (both `updater_check` + `updater_apply`; belt-and-suspenders refusal in apply)
- [x] Verify against the ACTUAL Claudesk cask symlink layout on a real brew install (confirm the resolved path contains Caskroom). Document the App-Translocation interaction (WP1 finding). **→ DEFERRED-to-WP6** (needs a real brew install of an updater-capable build; unit tests pin the path-shape logic meanwhile; App-Translocation documented in the enum doc-comment + a test)
- [x] (If path-resolution fragile) implement the baked install-source marker fallback + note the `/release` change it implies. **→ NOT NEEDED** — `current_exe()` → `resolve_bundle_path` → `canonicalize()` resolves cleanly; no baked marker required (revisit at WP6 if the real brew layout surprises).

### WP4: User-control UX + persistence (skip / disable-notifications / cancel-confirm) ✅ SHIPPED 2026-07-17 (commit `ee7bad7`, uncommitted-to-remote — batched on the unpushed M9+M10 tree)
**Description:** The user-facing control surface, kept **low-surface** per `[[explicit-selectable-mode-over-inferred-mode]]`. Non-modal update notification; a "Check for updates…" affordance (menu item / settings); skip-this-version; disable-notifications (default ON per `[[operator-helpful-friend-misfiring-as-offswitchable-setting]]`); cancel/confirm dialogs; a download progress bar. Prefs (`skipped_version: Option<String>`, `update_notifications_enabled: bool`) persist in `config_store` **per bundle-identity** (mirror `time_tracking_enabled`/`pip_mode`).
**Milestone:** 10
**Dependencies:** WP2 (consumes the flow); parallelizable with WP3. WP1's verdict may add an instruct-user quarantine dialog here.
**Size:** M
**As-built:** 5 phases. **P1** config_store prefs `update_notifications_enabled` (default **ON**) + `skipped_version` (get/set/broadcast command trio, per bundle-identity, mirror `time_tracking_enabled`). **P2** `updater_apply`'s download() emits a REAL `updater-download-progress` event `{downloaded,total,done}` (replaces WP2's no-op callback). **P3** pure FE gating (`updateNotifyState`: `shouldAutoNotify` + `manualCheckOutcome` — Q1 frontend-side skip/disable filter) + `updaterPrefs` seam + `updateFlowState` (specs + `progressPercent` + the WP1-fallback `QUARANTINE_FALLBACK_ACTIVE` seam, default GO/self-clear). **P4** a non-modal top-of-window **in-flow** banner (Update…/Skip/Dismiss + real progress bar + brew-defer branch), confirm dialog, WP1-fallback quarantine dialog, wired App-level via a `useUpdater` hook; **F12 layout back-loop** — the banner is an in-flow app-shell row (NOT absolute overlay) so it never covers filmstrip click-targets (operator-flagged misclick, re-verified live). Deleted the throwaway `UpdaterTrigger.tsx`. **P5** "Check for Updates…" app-menu item (manual check, ignores skip/disable) + picker "Update notifications" toggle + "Check for updates" button. Verify: backend 547 lib + 6 integ, clippy `--all-targets` clean; FE 105 files / 1154 tests, tsc/eslint/vite-build clean. Banner/confirm/progress/cancel + picker toggle round-trip + manual-check driven **LIVE via the MCP bridge**. review-quality: **0 CRIT / 1 MAJOR / 3 MINOR** — all auto-backlogged (MAJOR = `error`/`errorMessage` unconsumed → strong WP6 fold; see `# m10-wp4-updater-user-control-ux` in `backlog-quality-findings.md`). **Native menu-item live click + real-endpoint toast branches (up-to-date/brew/available) + destructive apply→relaunch + the error-surface wiring CARRIED to WP6.**
**Tasks:**
- [x] `config_store` prefs: `skipped_version` + `update_notifications_enabled` (default ON), per-identity read/write (mirror the M9 tracking-toggle plumbing). (P1)
- [x] Check-on-launch gated by the pref + not-in-skip-list → non-modal notify; a manual "Check for updates…" affordance (app-menu item + picker button) that always checks (ignores skip). (P3 gating + P4 hook + P5 menu/picker)
- [x] Confirm dialog → progress bar (from WP2's download callback, now a real event) → cancel (before `install()`, leaves app untouched) / confirm (proceed to install+relaunch). Skip-this-version persists the tag + suppresses future notifies. (P2 event + P4 flow)
- [x] If WP1 = FALLBACK: the instruct-user quarantine dialog (show the exact `xattr` command post-install). (built + seam-gated behind `QUARANTINE_FALLBACK_ACTIVE`, default false/GO; WP6's one-line flip if the live verdict needs it — P4)
- [x] Frontend tests for the pure UX-state logic (skip-list suppression, pref gating, cancel-boundary); live paths carried to WP6. (29 updater vitest tests + menu/picker wiring guards)

### WP5: `/release` publishing pipeline — manifest + signature + artifact ✅ SHIPPED 2026-07-17 (commit `5a72738`, uncommitted-to-remote — batched on the unpushed M9+M10 tree)
**Description:** Extend the `/release` skill (`.claude/skills/release/SKILL.md`) to publish the updater artifacts. Today it builds + publishes only the `.dmg`; it gains: build the `.app.tar.gz` + `.sig` (via `createUpdaterArtifacts`), generate + minisign-sign `latest.json` (version derived from the existing `tauri.conf.json`/`Cargo.toml` source-of-truth), and upload all (dmg + tar.gz + sig + latest.json) to the GH release. The `.dmg` stays (first-install/Homebrew). Manage the minisign private key as a release secret (documented, not committed).
**Milestone:** 10
**Dependencies:** WP1 (needs the keypair + confirmed artifact set) + WP2 (the pubkey/endpoint config must exist so the manifest shape is final). Somewhat independent of WP3/WP4 — release-tooling, can proceed in parallel with the UX WPs once WP1/WP2 land.
**Size:** S
**As-built:** Two-phase feature. **Phase 1 (fresh key rotation):** operator chose to mint a **fresh release-only minisign keypair** rather than promote the throwaway WP1 probe key. Key stored OUT-OF-REPO at `~/.claudesk-release-keys/` (`claudesk-release.key` 600 + `claudesk-release.key.pass` 600 [random `openssl rand -base64 32`, an operator-chosen password-in-a-file pattern fed via `--password "$(cat …)"` since tauri signer/build take the password as a STRING, no native password-file] + `.pub`, key id `774E2E8429FDF78A`). Swapped `tauri.conf.json` `plugins.updater.pubkey` probe→fresh (the committed trust anchor). Dry-run verify proof via the WP1 minisign harness re-pointed at the fresh key: VERIFY_OK real / VERIFY_FAIL tampered / VERIFY_FAIL vs probe-pubkey (cross-key negative confirms rotation is real). **Phase 2 (`/release` skill, `.claude/skills/release/SKILL.md`):** step 3 exports `TAURI_SIGNING_PRIVATE_KEY="$(cat …)"` (CONTENTS not `_PATH` — gotcha #1) + `_PASSWORD` before the build; post-build captures `bundle/macos/Claudesk.app.tar.gz`+`.sig` with a `.sig`-missing STOP guard; step 5b generates `latest.json` (version from `tauri.conf.json`; `signature` = `.sig` VERBATIM, do-NOT-re-encode — gotcha #2; url; pub_date) w/ inline sanity checks; step 7 `gh release create` uploads all FOUR assets + a `releases/latest/download/latest.json` endpoint-resolves check; Preconditions "Updater signing key" bullet + Notes&gotchas (2 signing gotchas + "first updatable release is the FLOOR" + brew detect-and-defer + corrected the stale "no updater yet" bullet). **Correctness proof (no live release):** end-to-end dry-run — manifest `signature` field → verified against the CONFIGURED `tauri.conf.json` pubkey → VERIFY_OK real / VERIFY_FAIL tamper (the exact `tauri-plugin-updater` path). Gates: 539 lib + 6 integ backend tests pass (config edit regressed nothing); no app code changed. review-quality: 0 CRIT / 2 MAJOR / 1 MINOR — **all resolved in-place** (MAJOR: `$VER` live-var-vs-placeholder convention collision → explicit `export VER=`; MAJOR: transient `latest.json` in repo root → gitignored + step-12 cleanup; MINOR: un-substituted `notes` placeholder → `NOTES=` marker). **Real live publish + real installed-build self-update DEFERRED-to-WP6** (folds in WP1 Gatekeeper + WP3 brew + WP2 harness-sig verdicts). **WP6 must use the FRESH key `774E2E8429FDF78A`, NOT the stale probe key.**
**Tasks:**
- [x] Add the `createUpdaterArtifacts` build outputs to the `/release` build step; capture the `.app.tar.gz` + `.sig` paths. (`createUpdaterArtifacts` already true from WP1; step 3 signing env-export + artifact capture + `.sig`-missing guard added)
- [x] Generate + sign `latest.json` (darwin-aarch64: version, url→GH-release asset, signature←.sig contents, notes/pub_date); minisign-sign with the private key (secret). (step 5b `jq -n` generator; signing is the build's integrated step via the string env var)
- [x] `gh release create` uploads dmg + tar.gz + sig + latest.json; verify the endpoint URL (`releases/latest/download/latest.json`) resolves. (step 7 four-asset upload + `curl … | jq -e '.version==VER'` endpoint check)
- [x] Document the private-key handling (where stored, how supplied at release) + the "first updatable release is the floor" note in the skill. (Preconditions bullet + Notes&gotchas + FLOOR/key-rotation note)

### WP6: Milestone-exit verify (real older unsigned installed build)
**Description:** End-to-end verification of the exit criteria on a REAL older unsigned installed `.app` (Finder-launched, `/Applications`, not translocated) — per the installed-build smoke-test convention (M10 touches lifecycle + external-process + Gatekeeper). Full check→confirm→download→install→relaunch into the newer version; brew-install correctly defers to `brew upgrade`; skip/disable/cancel all behave; the unsigned-relaunch quarantine handled (self-clear or instruct-user per WP1).
**Milestone:** 10
**Dependencies:** WP2–WP5 (the capability must be fully built + a real published-shaped release to update from)
**Size:** S
**Tasks:**
- [ ] From an older direct-download install: detect newer → confirm → download (progress) → install → relaunch into the new version, quarantine handled (no silent Gatekeeper failure).
- [ ] From a brew-cask install: the updater defers (shows `brew upgrade`, does NOT self-install); confirm no brew desync.
- [ ] Skip-version suppresses re-notify; disable-notifications stops auto-check (manual still works); cancel leaves the app untouched.
- [ ] Installed-`.app` smoke: GUI-PATH parity, per-identity pref isolation (dev vs prod), no regression to status dots / existing surfaces.

---

## Learning-Sequence Ordering

1. **WP1 (PROBE) — the unsigned-relaunch self-clear.** The riskiest unknown (does an unsigned self-updated bundle even relaunch clean?) resolved FIRST, cheaply, before any UX or release-tooling commits to the seamless-vs-instruct-user shape. Mirrors M9 WP1 (front-load the dominant risk) and the `[[explicit-selectable-mode-over-inferred-mode]]` risk-surface-vs-value rule.
2. **WP2 (updater core)** — the working synchronous update path over the frozen plugin config, folding in WP1's verdict. The engine before the polish.
3. **WP3 (brew detect-and-defer) + WP4 (user-control UX)** — parallel tracks over WP2's flow: WP3 is a pure decision-gate; WP4 is the control surface. Neither depends on the other.
4. **WP5 (`/release` pipeline)** — release-tooling; can start once WP1 (keypair + artifact set) + WP2 (final config shape) land, in parallel with WP3/WP4.
5. **WP6 (milestone-exit verify)** — end-to-end on a real installed build after everything's built; the exit gate.

**WP1 → WP2 rationale:** prove the unsigned self-updated bundle relaunches clean before building the flow around it — a FALLBACK verdict reshapes WP2's install→relaunch step and adds a WP4 dialog.
**WP2 → WP3/WP4 rationale:** the core flow must exist before the brew-gate can short-circuit it and before the UX can wrap it; WP3/WP4 are independent of each other → parallel.
**WP2 → WP5 rationale:** the `plugins.updater` config (pubkey + endpoint) must be final so the published `latest.json` shape matches what the app verifies against.

**No async/orchestration layer** — the updater flow is a synchronous check→download→install→relaunch; §5 (orchestration-after-sync) has no applicable async wrapper to defer. (`download()` is I/O-bound but the plugin owns its own async internally; there's no Claudesk-side queue/worker to sequence.)

## 3rd-Party Integration Note (§4 applied)

`tauri-plugin-updater` + the GitHub Releases update endpoint + minisign are the 3rd-party surfaces. **WP1 is the probe** that de-risks them: it verifies the artifact/manifest/verification shapes AND the macOS-unsigned install behavior on a real build before WP2 builds the dependent flow — the §4 "probe the integration before the dependent WP" discipline. (The `latest.json` manifest shape + minisign flow are already documented in `research.md` from the web pass; WP1 confirms them empirically on Claudesk's actual unsigned build.)

## Dependency Map

```
WP1 (PROBE: unsigned self-clear verdict) ── gates ──┐
                                                     ├─→ WP2 (updater core) ──┬─→ WP3 (brew detect-and-defer) ──┐
                                                     │                        ├─→ WP4 (user-control UX) ────────┤
                                                     └────────────────────────┴─→ WP5 (/release pipeline) ──────┼─→ WP6 (milestone-exit verify)
                                                                                                                 ┘
```

**Critical path:** WP1 → WP2 → (WP3 ∥ WP4 ∥ WP5) → WP6. WP1 is the gate; WP3/WP4/WP5 parallelize after WP2; WP6 is the exit.

**One net-new arch element** (already recorded in `arch.md` → "Milestone 10 architecture"): the update-artifact/manifest/minisign publishing pipeline + install-source detection + self-quarantine-clear mechanism. No new runtime data store; prefs ride the existing `config_store` per-identity pattern.
