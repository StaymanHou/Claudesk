# Feature: M10 WP5 — `/release` publishing pipeline (updater artifacts + signed manifest)

**Workflow:** feature
**State:** ship (complete)
**Created:** 2026-07-17
**Shipped:** 2026-07-17 (commit `011aea7`, local-only — batched on the unpushed M9+M10 tree, 20 ahead of origin/main)
**Entry:** spec (complex feature)
**Milestone:** 10 (In-app auto-updater), WP5
**Drive mode:** autopilot

## Work Tree

- [x] Phase 1: Fresh release key + pubkey swap + dry-run verify proof  <!-- status: DONE — all impl (P1.1–P1.3) + verify group (auto/self/human/codify) complete -->
  Relevance check n/a (Phase 1 first).
  **Observable outcomes:**
  - CLI (keygen): `~/.claudesk-release-keys/claudesk-release.key` + `.key.pub` exist; the `.key` is `chmod 600` (`stat -f %Lp` → `600`); the file is NOT under the repo tree (`git -C <repo> ls-files --error-unmatch` on it errors / it's an absolute path outside the repo). The fresh pubkey `!=` the WP1 probe pubkey.
  - CLI (config): `src-tauri/tauri.conf.json` `plugins.updater.pubkey` == the fresh `.key.pub` contents (base64), and `!=` the probe pubkey `dW50cnVzdGVk…eUt3dgo=`; `jq . src-tauri/tauri.conf.json` parses (valid JSON, no syntax break from the edit).
  - CLI (verify round-trip, the correctness proof): sign a real `.app.tar.gz` with the FRESH key (`tauri signer sign` or the auto-build sig), feed the resulting `.sig` contents VERBATIM + the fresh pubkey + the artifact to the re-pointed verify-harness → prints `VERIFY_OK (tampered=false)`; the same harness with `--tamper` (or a wrong-key sig) → prints `VERIFY_FAIL`. Proves the fresh-key sign→(verbatim-sig)→verify chain the shipped WP2 updater relies on.
  - [x] P1.1 Mint fresh release keypair: `~/.claudesk-release-keys/` created (700). Password stored in a chmod-600 FILE (`claudesk-release.key.pass`, 32 random bytes via `openssl rand -base64 32`) per operator request — fed non-interactively via `--password "$(cat …)"`. Key minted: `pnpm exec tauri signer generate -w ~/.claudesk-release-keys/claudesk-release.key --password "$(cat …key.pass)" --force`; `.key` chmod 600. Fresh pubkey = `…774E2E8429FDF78A…RWSK9/0phC5O…` (≠ probe `…401C…RWTkEdJw…`).  <!-- status: DONE -->
  - [x] P1.2 Swapped `src-tauri/tauri.conf.json` `plugins.updater.pubkey` probe→fresh; `createUpdaterArtifacts` + `endpoints` untouched. `jq -e .` → VALID JSON; config pubkey == fresh `.key.pub`, != probe.  <!-- status: DONE -->
  - [x] P1.3 Dry-run verify proof against the fresh key. Signed the real `to-0.2.6/Claudesk.app.tar.gz` (copied to scratch) with the fresh key → `.sig`. Harness (`~/claudesk-m10-probe/.../verify-harness/`, base64-decodes the sig field exactly like `tauri-plugin-updater`) with fresh pubkey + the `.sig` VERBATIM (`cmp` confirmed byte-identical to the `.sig` file) → `VERIFY_OK (tampered=false)`; `--tamper` → `VERIFY_FAIL`; fresh sig vs PROBE pubkey → `VERIFY_FAIL: created with a different key` (cross-key negative confirms the swap is real). Scratch: `…/scratchpad/wp5-verify/`.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — 4 scoped checks: jq valid JSON; updater shape intact (pubkey+endpoints+createUpdaterArtifacts:true); pubkey decodes to minisign key 774E2E8429FDF78A (fresh); git status shows only tauri.conf.json, NO key material tracked -->
  - [x] verify-self  <!-- status: DONE — 3 outcomes re-executed fresh, all PASS. O1 keygen (exist/600/not-tracked/≠probe); O2 config (valid JSON/==fresh/≠probe); O3 verify round-trip (VERIFY_OK untampered / VERIFY_FAIL tampered / sig verbatim byte-identical). Integration boundary (pubkey backs tauri-plugin-updater verify path) satisfied by O3 exercising the identical minisign+base64-decode-once algorithm on a real artifact. NO subagent spawn: CLI-only outcomes, no live-app dev-URL — per CLAUDE.md verify-self convention (don't spawn Playwright runner against a non-existent surface). No BLOCKING/COSMETIC fails. -->
  - [x] verify-human  <!-- status: DONE — operator ACK'd both items ("proceed"). Boundary's deep live-verify carried to WP6. -->
    - [x] P1.verify-human.1 Key-management posture ACK  <!-- status: DONE — operator approved: fresh key ~/.claudesk-release-keys/claudesk-release.key (600), pubkey 774E2E8429FDF78A baked into tauri.conf.json, password in claudesk-release.key.pass (600, openssl rand -base64 32). This is the durable release-signing setup. -->
    - [x] P1.verify-human.2 Boundary — live updater-verify carried to WP6  <!-- status: DONE — operator aware: real installed-build download→verify(fresh key)→install→Gatekeeper self-clear→relaunch is WP6's milestone-exit gate; WP6 uses the FRESH key, not the stale probe key. -->
  - [x] verify-codify  <!-- status: DONE — NO new tests warranted: deliverables = config edit + out-of-repo key material (secret, uncommittable) + a dependency's (tauri-plugin-updater) already-proven verify algorithm. A pubkey-literal test would be a brittle change-detector the next key rotation must update (negative value); the well-formedness invariants are covered by verify-auto's cheap one-offs. No test pins the pubkey literal (grep: only doc-comments). Scoped `cargo test --lib updater::` → 15 passed / 0 failed (WP2/WP3 not regressed by the config edit). Boundary's live test = WP6 by design. No Test Triage (0 failures). -->

- [x] Phase 2: `/release` skill — updater-publish steps + key-handling docs  <!-- status: DONE — all impl (P2.1–P2.5) + verify group (auto/self/human-autoskip/codify) complete -->
  **Relevance check (before Phase 2):** Requester still needs this: yes (operator's brew-first WP5 priority, ACK'd Phase 1). Requirements unchanged: yes (Phase 1 confirmed fresh-key/verbatim-sig/string-env shapes). Solution still feasible: yes (Phase 1 proved sign→verify). No superior alternative: yes (password-file was an enhancement, folded in). **Verdict: proceed.**
  **Observable outcomes:**
  - CLI (skill shape): `.claude/skills/release/SKILL.md` contains, in the correct step order — (a) the `export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.claudesk-release-keys/claudesk-release.key)"` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` BEFORE the `pnpm tauri build` step; (b) a post-build step capturing `bundle/macos/Claudesk.app.tar.gz` + `.sig` and failing if the `.sig` is absent; (c) a `latest.json` generation step matching the proven shape with the `.sig` VERBATIM (an explicit "do NOT re-base64-encode" caution); (d) `gh release create` uploading FOUR assets (dmg + tar.gz + sig + latest.json); (e) an endpoint-resolves check on `releases/latest/download/latest.json`; (f) a key-handling + "first updatable release is the FLOOR" documentation block. Grep-assert each is present.
  - CLI (latest.json generator dry-run): running the skill's documented `latest.json`-compose commands against a REAL `.app.tar.gz.sig` (the Phase-1 fresh-signed one) + a stub version produces a `latest.json` that (i) `jq .` parses, (ii) has `.platforms."darwin-aarch64".signature` byte-identical to the `.sig` file contents, (iii) has `.version` == the `tauri.conf.json` version, (iv) has the correct `url`. This is the mechanical proof the generation step is correct WITHOUT a live `gh release create`.
  - CLI (no-regression): the existing `.dmg` build + sha + tap-cask steps are unchanged (diff of `SKILL.md` shows additions/interleaves, not deletions of the dmg/tap flow); the two human GATES still present.
  - [x] P2.1 Edited SKILL.md step 3: signing env-var export (`export TAURI_SIGNING_PRIVATE_KEY="$(cat …key)"` + `..._PASSWORD="$(cat …key.pass)"`, gotcha #1 = CONTENTS not PATH) folded in BEFORE `pnpm tauri build`; post-build now lists all 3 artifacts + a `.sig`-present guard that STOPs on missing sig.  <!-- status: DONE -->
  - [x] P2.2 Added step 5b `latest.json` generation via `jq -n`: `version` from `$(jq -r .version tauri.conf.json)`; `signature` = `$SIG` verbatim (`$(cat …sig)`, with the "already base64 — do NOT re-encode" caution, gotcha #2); `url` = `releases/download/v${VER}/Claudesk.app.tar.gz`; `pub_date` = `$(date -u …Z)`. Sanity checks inline. GATE 1 updated to show the four assets + `cat latest.json`.  <!-- status: DONE -->
  - [x] P2.3 Extended step 7 `gh release create` to upload FOUR assets (dmg + tar.gz + sig + latest.json); added asset-name confirm + the `curl -sSL …/releases/latest/download/latest.json | jq -e '.version==VER'` endpoint-resolves check.  <!-- status: DONE -->
  - [x] P2.4 Added Preconditions "Updater signing key" bullet (key files at `~/.claudesk-release-keys/`, 600, never committed; pubkey `774E2E8429FDF78A` = trust anchor); updated frontmatter description + intro para (four assets); Notes&gotchas: corrected the stale "no tauri-plugin-updater yet" bullet, added the 2 signing gotchas + the "first updatable release is the FLOOR" (+ key-rotation resets it) note + the brew detect-and-defer note.  <!-- status: DONE -->
  - [x] P2.5 Dry-ran the whole new sequence non-destructively (env export from files → artifact-capture guard → step-5b latest.json compose) against the Phase-1 fresh-signed real artifact. latest.json valid; version==config (0.2.5); url correct; **END-TO-END: manifest `signature` field extracted → verified against the CONFIGURED tauri.conf.json pubkey → VERIFY_OK real / VERIFY_FAIL tamper** (exactly the tauri-plugin-updater path). Caught a newline subtlety (jq strips the .sig's trailing `\n`; content byte-identical, harmless, manifest still VERIFY_OK) → FIXED the skill's step-5b `diff` sanity-check to a newline-insensitive `$(...)`-both-sides compare so it doesn't false-STOP a future release. See Discoveries.  <!-- status: DONE -->
  - [x] verify-auto  <!-- status: DONE — grep-asserted all 6 skill-shape elements + no-regression. (a) env-export precedes build & uses $(cat) contents form; (b) .sig-MISSING STOP guard present (SKILL.md:148) + bundle/macos capture; (c) latest.json gen w/ verbatim $sig + do-NOT-re-encode caution; (d) 4 assets in gh release create; (e) latest/download/latest.json endpoint check; (f) FLOOR note + key location. No-regression: sha256 + brew audit intact, 2 GATES present. (Note: an initial (b) grep false-FAILed on a backtick-wrapped literal — manually confirmed the guard IS present.) -->
  - [x] verify-self  <!-- status: DONE — 3 outcomes re-executed fresh, all PASS. O1 skill-shape (verify-auto). O2 latest.json gen: jq parses / sig content-identical (newline-insensitive) / version==config (0.2.5) / url correct; CROWN = manifest signature extracted → verified against the CONFIGURED tauri.conf.json pubkey → VERIFY_OK real, VERIFY_FAIL tamper (the exact tauri-plugin-updater path). O3 no-regression (verify-auto). NO integration boundary — edits an isolated manual-only skill procedure doc, not code on a runtime surface. NO subagent spawn: CLI-only, no live-app dev-URL (per CLAUDE.md verify-self convention). No BLOCKING/COSMETIC. -->
  - [x] verify-human  <!-- status: DONE (AUTO-SKIP F11, drive_mode=autopilot) — no integration boundary (edits an isolated manual-only skill procedure doc, not code on a runtime surface); verify-self all-PASS; no outcome cites a consuming surface this phase modifies. Correctness proven end-to-end in verify-self (manifest-sig → configured pubkey → VERIFY_OK). Live `gh release create` publish + real installed-build self-update = WP6 / operator-run `/release`. -->
  - [x] verify-codify  <!-- status: DONE — NO new tests warranted: deliverable is a manual-only skill PROCEDURE DOC (.claude/skills/release/SKILL.md), no runtime code surface to regression-test. A string-presence test = brittle change-detector (negative value); executing latest.json-gen needs the SECRET key + a real artifact (uncommittable, not CI-runnable) → the real end-to-end is WP6's operator/installed-build gate. No project test references the skill/latest.json (grep: 1 doc-comment only). Phase 2 touched ZERO app code (git status: only SKILL.md + Phase-1's tauri.conf.json + the WIP); no key material leaked to git. No Test Triage (nothing to run). Correctness was proven in verify-self (manifest-sig → configured pubkey → VERIFY_OK). -->

## Current Node
- **Path:** Feature > COMPLETE (all phases + verify groups done) → ready to ship
- **Active scope:** none — WP5 build+verify complete
- **Blocked:** none
- **Unvisited:** none (Phase 1 + Phase 2 both `[x]`)
- **Open discoveries:** none open (password-file pattern applied in the docs; newline sanity-check subtlety fixed)

## Discoveries
<!-- Format: [SURFACED-<date>] <target node> — <summary>
     Each entry is also logged to workflow/backlog.md -->
- [SURFACED-2026-07-17] Phase 2 (P2.1/P2.4) — **Password-file pattern (operator-chosen).** APPLIED. The release-key password is stored in a chmod-600 FILE `~/.claudesk-release-keys/claudesk-release.key.pass` (random 32-byte base64), NOT typed interactively. `tauri signer generate`/`sign` and the build's `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` all take the password as a STRING (no native password-file support), so it's fed via `--password "$(cat …key.pass)"` / `export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat …key.pass)"`. The `/release` skill docs (step 3 signing env export + Preconditions key bullet + Notes&gotchas) use this `$(cat …)` form and note both `.key` and `.pass` live in `~/.claudesk-release-keys/` (600, never committed). Local tooling detail — not a product/arch SURFACE; carried in-WIP only.
- [SURFACED-2026-07-17] Phase 2 (P2.5) — **`latest.json` signature field: content-equal to the `.sig`, NOT byte-equal (trailing newline).** `jq -n --arg sig "$(cat …sig)"` (and `jq -r` on read-back) STRIP the `.sig` file's trailing `\n`, so the stored `signature` string is the base64 content WITHOUT the newline. This is CORRECT — the shipped manifest field has no stray newline, and the manifest-sig verifies VERIFY_OK against the configured pubkey (proven end-to-end). But a naive `diff <(jq -r …) file.sig` reports "differs / \ No newline at end of file" — a false alarm. The skill's step-5b sanity-check was changed from `diff` to a newline-insensitive `[ "$(jq -r …)" = "$(cat …sig)" ]` compare so a future `/release` run doesn't wrongly STOP. Local tooling detail — carried in-WIP only.

---

## Code-Quality Review — m10-wp5-release-publishing-pipeline

Reviewer subagent (`code-quality-reviewer`) against ship commit `011aea7`. Verdict: **0 CRITICAL / 2 MAJOR / 1 MINOR.** All findings were **RESOLVED IN-PLACE** during review (trivial doc corrections to the just-shipped `SKILL.md`, fresh-re-verified) — see disposition below. Amended into the ship commit rather than left as open backlog (keeps backlog open-work-only). Assessment: *"well-built, appropriately-scoped… advances the codebase (unblocks WP6's real end-to-end) more than it accrues debt."*

### Strengths
- Both signing gotchas encoded with why + failure-mode (self-diagnosable from the text).
- `.sig`-missing STOP guard placed before the GATE, not after publish.
- Pubkey swap correct + verifiable (decodes to key ID `774E2E8429FDF78A`, matches commit/precondition/FLOOR note).
- Newline-insensitive sanity-check pre-empts a false-STOP; stale "no updater yet" bullet corrected in place.

### Issues (all RESOLVED)
**CRITICAL** — none.

**MAJOR**
- [SKILL.md — `$VER` convention collision] The new step-3+ shell blocks used `$VER`/`${VER}` as a live var, but the skill's convention defined `VER` as a hand-substituted textual placeholder never `export`ed → an unset `$VER` empty-expands (`Claudesk__aarch64.dmg`, versionless url, empty manifest version). — **RESOLVED:** added an Inputs sub-bullet distinguishing prose-placeholder vs live-shell-var use, with an explicit `export VER=…` (or derive-from-`tauri.conf.json`) instruction before the step-3+ blocks; reconciled the executable `shasum` + `git tag`/`gh release create` lines to `${VER}`/`v${VER}` (illustrative prose lines kept as `<VER>` placeholders). Re-verified: `$VER` expands, url versioned, dmg path versioned.
- [SKILL.md:189 — `latest.json` left in repo root] Written to repo root, not gitignored, no cleanup → dirties the tree and trips the skill's own clean-tree precondition on the next run. — **RESOLVED:** added `/latest.json` to `.gitignore` (backstop) + a `rm -f latest.json` cleanup at step 12 (after upload). Re-verified: `git check-ignore latest.json` → ignored.

**MINOR**
- [SKILL.md:199 — un-substituted `notes` placeholder] `notes` has no downstream sanity-check, so an un-substituted `<one-line summary…>` would publish verbatim. — **RESOLVED:** hoisted to a `NOTES=` var with a "← SUBSTITUTE before running" marker + an explicit ⚠️ reminder (GATE-1 `cat latest.json` remains the backstop).

### If you disagree
Operator: dismiss any finding by editing this section and marking the line `[DISMISSED]` before finalize archives the WIP. (N/A — all fixed.)

---

## Original spec (preserved)

## Problem Statement

The `/release` skill today builds + publishes only the `.dmg` (first-install / Homebrew artifact). M10's in-app updater (`tauri-plugin-updater`, shipped in WP2) needs three more artifacts published per release so a running Claudesk can self-update:

1. **`Claudesk.app.tar.gz`** — the update payload the updater downloads + extracts (produced by `bundle.createUpdaterArtifacts: true`, already set).
2. **`Claudesk.app.tar.gz.sig`** — its minisign signature (auto-produced by the build's sign step when the private-key env var is set).
3. **`latest.json`** — the static update manifest the app polls at `https://github.com/StaymanHou/Claudesk/releases/latest/download/latest.json` (endpoint already baked into `tauri.conf.json`), carrying the version, the `.sig` contents, the artifact URL, notes, and pub_date.

Without WP5, the updater engine (WP2) + brew gate (WP3) have nothing real to update *from* — WP6's end-to-end milestone-exit verify is blocked on WP5 producing a real published-shape release.

A second, security-load-bearing problem: the pubkey currently in `tauri.conf.json` is the **WP1 throwaway probe key** (`~/claudesk-m10-probe/m10-probe-keys/claudesk-probe.key`, explicitly labeled "NOT the real release key"). WP5 must swap in a real release-only key **before** the first updatable release ships — because the baked pubkey becomes the trust anchor every future update is verified against ("first updatable release is the FLOOR", arch.md M10 key decision).

## User Stories

- **As the operator cutting a release,** I want `/release` to build, sign, and publish the updater artifacts (tar.gz + sig + latest.json) alongside the `.dmg` in the same run, so that a single `/release` invocation makes the new version both first-installable (dmg/brew) and self-updatable-to (updater).
- **As a friend running a direct-download install of Claudesk,** I want the published `latest.json` to point at a correctly-minisigned artifact, so that my in-app "update available → confirm → download → install → relaunch" flow verifies and succeeds (no silent verify-fail).
- **As the operator,** I want the release to sign with a durable, real release-only key stored outside the repo (not the throwaway probe key), so that the trust anchor baked into shipped builds is one I control long-term and never accidentally commit.

## Acceptance Criteria

The feature is done when:

### A. Fresh release key minted + wired (one-time, precedes the pipeline changes)
- [ ] A **fresh** minisign release keypair is generated via `tauri signer generate` (NOT the WP1 probe key).
- [ ] The **private key** is stored at a durable non-repo path: **`~/.claudesk-release-keys/claudesk-release.key`** (+ its `.pub`), `chmod 600`, never committed. (`~/claudesk-m10-probe/` was scratch and outside the repo but is probe-scoped; the release key gets its own durable home.)
- [ ] The **new pubkey** replaces the probe pubkey in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` (a committed source change — the trust anchor).
- [ ] The private key's password is recorded where the operator keeps release secrets (operator-managed; the skill documents *that* it's needed as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, not the value).

### B. `/release` skill gains the updater-publish steps
- [ ] The skill exports **`TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.claudesk-release-keys/claudesk-release.key)"`** (the key **CONTENTS as a string**, not `..._PATH`) + **`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`** *before* `pnpm tauri build`, so the integrated build auto-signs the updater artifact. (SURFACE-2026-07-17-M10-WP5-SIGNING-KEY-ENV-VAR-IS-STRING-NOT-PATH.)
- [ ] After the build, the skill captures the two updater artifacts from `src-tauri/target/release/bundle/macos/`: `Claudesk.app.tar.gz` + `Claudesk.app.tar.gz.sig`, and confirms both exist (build fails/exits-1 if signing didn't fire → the skill catches "no `.sig`" and stops).
- [ ] The skill **generates `latest.json`** with the exact proven shape: `{ version, notes, pub_date, platforms: { "darwin-aarch64": { signature: <.sig contents VERBATIM>, url: <GH-release-asset URL> } } }`.
  - `version` derives from the existing source of truth (`tauri.conf.json` / `Cargo.toml` `VER`) — no third hand-maintained copy.
  - `signature` is the **`.sig` file contents pasted verbatim** — NOT re-base64-encoded (the plugin base64-*decodes* the field once). (SURFACE-2026-07-17-M10-WP5-SIGNING-KEY-ENV-VAR-IS-STRING-NOT-PATH, second finding.)
  - `url` = `https://github.com/StaymanHou/Claudesk/releases/download/vVER/Claudesk.app.tar.gz`.
  - `notes` derived from the same CHANGELOG summary already drafted for the release notes; `pub_date` = release time in ISO-8601 (`date -u +%Y-%m-%dT%H:%M:%SZ`).
- [ ] `gh release create` uploads **all four**: the `.dmg` (unchanged) + `Claudesk.app.tar.gz` + `Claudesk.app.tar.gz.sig` + `latest.json`.
- [ ] The skill verifies **`https://github.com/StaymanHou/Claudesk/releases/latest/download/latest.json` resolves** (the endpoint the app polls) — e.g. `gh release view vVER --json assets` shows all four asset names, and (optionally) a `curl -sL` of the `latest/download/latest.json` URL returns the manifest.
- [ ] The skill **documents the private-key handling** (where stored, that the two env vars must be exported, that the value is never committed/echoed) + the "**first updatable release is the FLOOR**" note (this release is the first that later versions can update from; currently-installed builds still `brew upgrade`/re-download once).

### C. Correctness proof (agent-runnable, no live release)
- [ ] A **dry-run signature round-trip** proves the pipeline's sign→manifest→verify chain against the FRESH key **without cutting a public release**: build (or reuse) a `.app.tar.gz`, sign it with the release key, compose a `latest.json` with the `.sig` verbatim, and minisign-verify the artifact against the new pubkey → VERIFY_OK; a tampered artifact → VERIFY_FAIL. (Reuses/adapts the WP1 verify-harness at `~/claudesk-m10-probe/m10-probe-artifacts/verify-harness/`, re-pointed at the new key — proves the *new* key wiring, closing the probe-key→release-key gap.)
- [ ] The `.dmg` path stays exactly as today (first-install/Homebrew unaffected — no regression to the existing release flow).

## Out of Scope

- **Cutting an actual public GitHub release.** WP5 delivers the *tooling* + the key swap; the first real release using it is a later, operator-initiated `/release` run (and WP6 verifies the end-to-end on a real installed build). WP5's proof is the dry-run round-trip (C), not a live publish.
- **The updater UX** (skip / disable / cancel-confirm / progress bar) — that's WP4.
- **The brew detect-and-defer gate** — shipped in WP3.
- **The self-quarantine-clear / instruct-user relaunch mechanism** — that's WP2 (code) + WP6 (live verify).
- **Notarization / Apple signing** — LOCKED out at M10 (stay unsigned + minisign). Not revisited here.
- **Multi-platform artifacts** (`darwin-x86_64`, Windows, Linux) — Claudesk is Apple-Silicon-only; single `darwin-aarch64` target matches the single `.dmg`.
- **Automating the interactive `tauri signer generate` keygen inside the skill** — the keygen is a one-time operator step (interactive password prompt); the skill documents it, doesn't automate it.

## Technical Constraints

- **3rd-party probe: COMPLETE (WP1).** `tauri-plugin-updater` + GitHub Releases endpoint + minisign are the 3rd-party surfaces. **WP1 is the completed probe** — it empirically verified the `.app.tar.gz`+`.sig` artifact set, the `latest.json` manifest shape (proven at `~/claudesk-m10-probe/m10-probe-artifacts/serve/latest.json`), and the minisign verify chain (verify-harness VERIFY_OK/FAIL). No known-unknown remains; WP5 is release-tooling over an already-verified integration. (WBS §"3rd-Party Integration Note".)
- **Two signing gotchas MUST be applied (SURFACE-2026-07-17-M10-WP5-SIGNING-KEY-ENV-VAR-IS-STRING-NOT-PATH):**
  1. The build auto-sign reads **`TAURI_SIGNING_PRIVATE_KEY`** = key CONTENTS as a string, **NOT `..._PATH`**. With only `..._PATH`, the build bundles then FAILS at exit ("A public key has been found, but no private key…") and ships an UNSIGNED tar.gz. → `export TAURI_SIGNING_PRIVATE_KEY="$(cat <keyfile>)"`.
  2. The `latest.json` `signature` field = the `.sig` file contents **VERBATIM** (it's already base64; the plugin decodes it once). Do **NOT** re-base64-encode. → `cat`/read the `.sig` into the field as-is.
- **Config already production-shaped from WP1/WP2** (verified 2026-07-17): `bundle.createUpdaterArtifacts: true` ✅, `plugins.updater.endpoints` = the GH `latest/download/latest.json` URL ✅. WP5's only config edit is swapping the **pubkey** (probe → fresh release key).
- **`latest.json` proven shape (from WP1):** `{version, notes, pub_date, platforms:{"darwin-aarch64":{signature, url}}}`. This is the exact shape the shipped WP2 updater verifies against — WP5's generator must match it byte-for-structure.
- **Artifact output location:** `src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz(.sig)` (updater artifacts) — distinct from `bundle/dmg/Claudesk_VER_aarch64.dmg` (existing dmg step).
- **`/release` skill is MANUAL-ONLY** — WP5 edits `.claude/skills/release/SKILL.md`; the two existing human gates (pre-publish, pre-tap-push) stay. The updater-publish steps slot into the existing step sequence (build → sha → notes → GATE1 → publish → tap → GATE2 → push), with signing env-var export before the build and the latest.json compose + upload folded into the publish step.
- **Deliverable is skill-doc + one config edit + a dry-run proof harness.** No app (Rust/TS) code changes — WP2/WP3 already shipped the runtime side. This is release-tooling; the "verify-self" is the dry-run signature round-trip (C), not a live-app observation. No `pnpm tauri:dev` / MCP-bridge surface applies.
- **Key storage:** `~/.claudesk-release-keys/` (new durable dir, outside repo, `chmod 600` on the `.key`). The `.gitignore` posture is moot (path is outside the repo tree) but the skill must warn never to move/commit it.

## Open Questions

_None blocking._ The one load-bearing decision (fresh release key vs. promote probe key) was settled with the operator at spec entry → **generate a fresh release-only key**. All artifact/manifest/signing shapes are proven by WP1. Remaining specifics (exact `latest.json` field wording, where in the step sequence each edit lands) are plan-time mechanics, not unknowns.

## Notes for planning
- **Ordering within the cut:** the fresh-key mint + pubkey swap (A) is a **one-time prerequisite** done once before the first WP5-enabled release; it can be committed as part of WP5 even though no release fires. The skill changes (B) + dry-run proof (C) are the durable deliverable.
- **WP6 dependency:** WP6's real end-to-end verify now runs against the **fresh** release key (not the probe key) — note this hand-off so WP6 doesn't reuse the stale probe pubkey.
- **Verify posture (autopilot):** verify-self = the dry-run signature round-trip (agent-runnable). The real publish + real-installed-build update is WP6 (operator/installed-build exit gate). No verify-human live-app step is meaningful at WP5 (nothing runtime-observable changed in the app).
```

