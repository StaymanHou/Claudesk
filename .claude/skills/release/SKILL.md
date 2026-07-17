---
name: release
description: Cut a new Claudesk release — bump the version, clean-build the .dmg + updater artifacts (.app.tar.gz + .sig + signed latest.json), publish a GitHub release, and bump the Homebrew tap cask. MANUAL-ONLY; invoke by hand when the operator says "cut a release" / "ship a release" / "/release". NEVER auto-invoked by feature-ship or product-finalize.
---

# Release Claudesk

Drives a full Claudesk release end-to-end: bump the version, do a clean production
build, tag the commit, publish a GitHub release with **four assets** — the `.dmg`
(first-install / Homebrew) plus the three in-app-updater artifacts (`Claudesk.app.tar.gz`,
its minisign `.sig`, and the signed `latest.json` manifest) — and update the Homebrew
tap cask (`StaymanHou/homebrew-claudesk`) so `brew install --cask claudesk` picks up
the new version. The updater artifacts are what a running Claudesk downloads to
self-update (M10); the `.dmg`/cask path is unchanged.

The flow pauses at two human gates — before publishing the GitHub release, and
before pushing the tap cask — because both are irreversible outward-facing actions.

## ⚠️ MANUAL-ONLY — do not wire into any workflow

**This skill is invoked ONLY by the operator, by hand** (they say "cut a release",
"ship a release", or `/release`). It is deliberately a standalone skill with **no
transition wiring** into the feature or product state machines.

- **`feature-ship` MUST NOT invoke it.** Shipping a feature is a git push, not a
  product release.
- **`product-finalize` MUST NOT invoke it.** Closing a milestone/WBS cycle is a
  docs-and-archive operation, not a product release.
- A release is an **outward-facing publish** (cuts a public GitHub release + a
  binary friends will install). It happens on the operator's explicit say-so and
  never as a side effect of any close skill. If you are an orchestrator driving a
  workflow and you reach a "ship"/"finalize"/"close" step, do **not** reach for
  this skill — releasing is out of band.

If you find yourself about to call this skill from inside another skill's chain,
stop: that's the failure mode this constraint exists to prevent.

## Preconditions

- **Working tree clean**, on `main`. Uncommitted changes must be dealt with before
  starting (this skill will add a version-bump commit of its own).
- **`gh` installed and authenticated** (`gh auth status`). If missing:
  `brew install gh && gh auth login` (the auth is interactive — the operator runs it).
- **Apple Silicon host** — the build produces an `aarch64` `.dmg`.
- **Tap repo present** at `homebrew-claudesk/` **nested inside this project** (its own
  independent git repo; gitignored by the canonical claudesk repo). If absent, clone
  it there: `gh repo clone StaymanHou/homebrew-claudesk homebrew-claudesk`.
  Confirm its remote is SSH — `git -C homebrew-claudesk remote get-url origin` should
  print `git@github.com:StaymanHou/homebrew-claudesk.git`. If a fresh clone came down
  over HTTPS, switch it:

  ```bash
  git -C homebrew-claudesk remote set-url origin git@github.com:StaymanHou/homebrew-claudesk.git
  ```

- **Updater signing key present** at `~/.claudesk-release-keys/` (created M10 WP5):
  - `claudesk-release.key` — the minisign **private** key (`chmod 600`, NEVER committed).
  - `claudesk-release.key.pass` — its password (`chmod 600`, a random string; NEVER committed).
  - `claudesk-release.key.pub` — the public key, key ID `774E2E8429FDF78A`. Its base64 form
    is baked into `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` — **the trust anchor
    every published update is verified against.** Do NOT change the config pubkey unless you are
    deliberately rotating the key (a key rotation strands users on the old key until they
    `brew upgrade`/re-download — see "first updatable release is the FLOOR" below).

  Confirm the key files are present before starting; if this machine doesn't have them, the
  build's sign step (step 3) cannot produce the `.sig` and the release cannot ship updater
  artifacts:

  ```bash
  ls -la ~/.claudesk-release-keys/claudesk-release.key ~/.claudesk-release-keys/claudesk-release.key.pass
  ```

  If missing (new machine / lost key): STOP. Either restore the key from your secret backup, or
  — if genuinely lost — mint a new one (`pnpm exec tauri signer generate -w ~/.claudesk-release-keys/claudesk-release.key`),
  swap the new `.pub` into `tauri.conf.json`, and accept that this becomes a key rotation.

## Inputs

- **Version** — e.g. `0.1.1`. Ask the operator if not given. Throughout these steps,
  let `VER` be the version (no leading `v`); the git tag is `vVER`.
  - In *prose and in the version-bump edits* (step 2), `VER`/`vVER` are textual
    placeholders you substitute by hand (`Claudesk_VER_aarch64.dmg` → `Claudesk_0.2.6_aarch64.dmg`).
  - In the *shell blocks from step 3 onward* (signing export, `latest.json` gen,
    `gh release create`, the endpoint check), `$VER`/`${VER}` are used as a **live shell
    variable**. **Export it once at the top of your release shell before running those
    blocks** so every `$VER` expands correctly (and so the same shell holds it across
    steps):

    ```bash
    export VER=0.2.6   # ← the version you're cutting, no leading v
    ```

    (Or derive it: `export VER="$(jq -r .version src-tauri/tauri.conf.json)"` **after**
    the step-2 bump commit, so it matches the source of truth.) The step-3+ blocks assume
    `$VER` is set; an unset `$VER` empty-expands (`Claudesk__aarch64.dmg`, a versionless
    `url`, an empty manifest `version`) — set it first.

## Steps

Run from the project root (`/Users/stayman/Personal/projects/claudesk`).

1. **Check preconditions** (above). Confirm `gh auth status` is OK, the working tree
   is clean, and the tap repo is present with an SSH remote. STOP and tell the
   operator if any fails.

2. **Bump the version.** Edit both:
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`

   Then refresh `Cargo.lock` (so its `claudesk` entry matches the new version),
   commit, and push:

   ```bash
   (cd src-tauri && cargo update -p claudesk)   # rewrites the claudesk version in Cargo.lock; no network
   git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "Release vVER"
   git push origin main
   ```

   (`cargo update -p claudesk` just re-resolves the local package's own entry in the
   lockfile to the new `Cargo.toml` version — it does not bump dependencies. If for
   any reason `Cargo.lock` still shows the old version, the clean build in step 3
   will rewrite it; re-stage and amend if so. The release must point at a pushed
   commit.)

3. **Export the updater-signing env vars, then clean build.** The build's integrated
   sign step produces the updater artifact **and its `.sig`** — but ONLY if the private
   key is supplied as a **string** in `TAURI_SIGNING_PRIVATE_KEY` (see the "Updater
   signing" gotcha below — `..._PATH` does NOT work for the build auto-sign path and
   ships an unsigned `.tar.gz`). Export both env vars in the **same shell** as the build:

   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.claudesk-release-keys/claudesk-release.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat ~/.claudesk-release-keys/claudesk-release.key.pass)"
   ```

   (The private key + its password live in `~/.claudesk-release-keys/` — see "Updater
   signing key" in Preconditions. Both are read as file CONTENTS via `$(cat …)`; never
   echo either value, never paste it into a committed file.)

   Then a full cold rebuild guarantees no stale-cache artifact ships:

   ```bash
   (cd src-tauri && cargo clean)
   pnpm tauri build
   ```

   This is a **long** cold build (multi-minute — likely 3–8 min). Pass an explicit
   Bash `timeout` (consult `runtimes.md` for the recorded `pnpm tauri build` time;
   if absent, use 600000 ms — the Bash max — and record the observed time to
   `runtimes.md` afterward). Three artifacts land:
   - `src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg` (first-install / Homebrew)
   - `src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz` (updater payload)
   - `src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz.sig` (minisign signature)

   **Confirm all three exist — and specifically that the `.sig` is present:**

   ```bash
   ls -la src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg
   ls -la src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz \
          src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz.sig
   ```

   ⚠️ **If `Claudesk.app.tar.gz.sig` is MISSING**, the build did not sign (the env var
   wasn't exported as a string, or the password was wrong). STOP — do not publish an
   unsigned updater artifact (the app would reject the update at verify time). Re-export
   `TAURI_SIGNING_PRIVATE_KEY` (contents, not path) + the password and rebuild.

4. **Compute the SHA-256** (the cask needs it; keep the hash):

   ```bash
   shasum -a 256 src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg
   ```

5. **Draft the release notes from the CHANGELOG.** Read `CHANGELOG.md` and collect
   the entries added since the previous release tag (`git tag --sort=-v:refname` →
   the tag before `vVER`; `git log <prevtag>..HEAD` to see what landed). Draft a
   short release-notes body summarizing those entries, and **always append the
   standard unsigned-install caveat block**:

   ```
   **Unsigned build.** macOS Gatekeeper blocks it on first launch. After install:

       xattr -dr com.apple.quarantine /Applications/Claudesk.app

   Install via the tap: `brew tap StaymanHou/claudesk && brew trust --cask StaymanHou/claudesk/claudesk && brew install --cask claudesk`
   ```

5b. **Generate the updater manifest `latest.json`.** This is the file the running app
   polls (`plugins.updater.endpoints` in `tauri.conf.json` →
   `https://github.com/StaymanHou/Claudesk/releases/latest/download/latest.json`). Compose
   it from data already in hand — `VER`, the `.sig` contents, and the eventual asset URL:

   ```bash
   SIG="$(cat src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz.sig)"
   PUB_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
   NOTES="<one-line summary — reuse the release-notes headline from step 5>"   # ← SUBSTITUTE before running
   jq -n \
     --arg version "$VER" \
     --arg notes "$NOTES" \
     --arg pub_date "$PUB_DATE" \
     --arg sig "$SIG" \
     --arg url "https://github.com/StaymanHou/Claudesk/releases/download/v${VER}/Claudesk.app.tar.gz" \
     '{version:$version, notes:$notes, pub_date:$pub_date,
       platforms:{"darwin-aarch64":{signature:$sig, url:$url}}}' \
     > latest.json
   ```

   ⚠️ **Substitute the `NOTES=` placeholder** with the real headline before running —
   unlike `signature`/`url`, `notes` has no downstream sanity-check, so an un-substituted
   `<one-line summary…>` would publish verbatim into the manifest. The GATE-1
   `cat latest.json` review is the backstop; substitute it here so the gate confirms, not fixes.

   ⚠️ **`signature` = the `.sig` file contents VERBATIM.** The `.sig` tauri produces is
   ALREADY base64; the updater plugin base64-**decodes** the field once at verify time.
   **Do NOT re-encode it** (`base64 latest… ` / `openssl base64` on the `.sig` → double-encoded
   → `Signature::decode` fails → every update rejects). The `--arg sig "$SIG"` above passes
   it as-is — correct. (Empirically confirmed: verbatim `.sig` verifies; double-encoded fails.)

   Sanity-check the manifest before the gate:

   ```bash
   jq -e '.version and .platforms."darwin-aarch64".signature and .platforms."darwin-aarch64".url' latest.json
   # signature field content must equal the .sig file content. Compare via $(...) on BOTH sides
   # so the .sig's trailing newline (which jq strips from the stored field) doesn't false-alarm —
   # a plain `diff` reports "\ No newline at end of file" even when the base64 is identical.
   [ "$(jq -r '.platforms."darwin-aarch64".signature' latest.json)" = \
     "$(cat src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz.sig)" ] \
     && echo "sig verbatim OK" || echo "⚠️ signature field != .sig content — do NOT publish"
   ```

6. **⏸ GATE 1 — confirm before publishing.** Show the operator:
   - the built `.dmg` path + its size + the sha256,
   - the four assets that will upload (dmg + `Claudesk.app.tar.gz` + `.sig` + `latest.json`),
   - the composed `latest.json` (`cat latest.json`) — confirm `version`, `url`, and that
     `signature` is the verbatim `.sig`, and
   - the full drafted release notes.

   Wait for explicit approval (and apply any edits the operator gives). Do NOT run
   step 7 until they say go — step 7 publishes publicly.

7. **Tag + publish the GitHub release — with ALL FOUR assets.** The `.dmg`
   (first-install/Homebrew) **plus** the three updater artifacts (`Claudesk.app.tar.gz`,
   its `.sig`, and `latest.json`) go up in one `gh release create`:

   ```bash
   git tag "v${VER}"
   git push origin "v${VER}"
   gh release create "v${VER}" \
     "src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg" \
     "src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz" \
     "src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz.sig" \
     "latest.json" \
     --title "Claudesk v${VER}" \
     --notes "<the approved notes from step 6>"
   ```

   Confirm all four asset names are present:

   ```bash
   gh release view "v${VER}" --json assets --jq '.assets[].name'
   # expect: Claudesk_<VER>_aarch64.dmg, Claudesk.app.tar.gz, Claudesk.app.tar.gz.sig, latest.json
   ```

   The dmg asset URL will be
   `https://github.com/StaymanHou/Claudesk/releases/download/v<VER>/Claudesk_<VER>_aarch64.dmg`.

   **Then confirm the updater ENDPOINT resolves** — the exact URL the running app polls
   (`releases/latest/download/latest.json`, which GitHub aliases to *this* release once
   it's the latest). Fetch it and confirm it's the manifest you just published:

   ```bash
   curl -sSL https://github.com/StaymanHou/Claudesk/releases/latest/download/latest.json | jq -e '.version == "'"$VER"'"' \
     && echo "endpoint resolves → version $VER" \
     || echo "⚠️ endpoint did NOT return version $VER — the app's check() will not see this update"
   ```

   (If this is a pre-release or not the newest tag, `latest/download/` points elsewhere —
   the check is meaningful only when vVER is the newest published release, which is the
   normal `/release` case.)

8. **Bump the tap cask.** In `homebrew-claudesk/Casks/claudesk.rb` (nested in this
   project), update:
   - `version "VER"`
   - `sha256 "<hash from step 4>"`

   The `url` is version-interpolated (`v#{version}` / `#{version}`), so it does not
   need editing. Validate against the installed tap copy (audit/style read the
   INSTALLED copy, not the working tree):

   ```bash
   cp homebrew-claudesk/Casks/claudesk.rb \
      "$(brew --repository)/Library/Taps/staymanhou/homebrew-claudesk/Casks/claudesk.rb"
   brew audit --cask staymanhou/claudesk/claudesk    # must be clean (no output)
   brew style staymanhou/claudesk/claudesk           # must be clean
   ```

   If audit or style fails, fix the cask and re-validate before the gate.

9. **⏸ GATE 2 — confirm before pushing the tap.** Show the operator the cask diff
   (`git -C homebrew-claudesk diff Casks/claudesk.rb`) and the clean audit/style
   results. Wait for explicit approval before step 10.

10. **Push the tap:**

    ```bash
    git -C homebrew-claudesk commit -am "claudesk VER"
    git -C homebrew-claudesk push origin HEAD
    ```

11. **Hand the operator the install-upgrade block — do NOT run it yourself (SOP, 2026-06-27).**

    ⚠️ **The agent MUST NOT run `brew upgrade --cask claudesk` during `/release`.** It
    deletes the currently-running `/Applications/Claudesk.app` and lays down a fresh,
    RE-QUARANTINED copy — which **KILLS any running Claudesk, and `/release` is almost
    always invoked from a Claude Code session running *inside* Claudesk**, so the
    upgrade would kill the very session driving the release (and read to the operator
    as "Claudesk crashed"). The smoke-test is therefore **operator-run, by hand, after
    the session** — not an agent step.

    **What the agent does:** print the copy-paste block below and tell the operator to
    run it **in Terminal.app (NOT a Claudesk workspace)** whenever convenient. That's
    the whole of Step 11 from the agent's side — then proceed to Step 12.

    ```bash
    # Run in Terminal.app, not inside Claudesk. Quit Claudesk (Cmd-Q) first.
    brew update
    brew upgrade --cask claudesk        # or `brew reinstall --cask claudesk` if already at VER
    xattr -dr com.apple.quarantine /Applications/Claudesk.app   # MUST precede any relaunch
    # verify, then reopen:
    brew list --cask --versions claudesk   # must read: claudesk VER
    /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" /Applications/Claudesk.app/Contents/Info.plist  # VER
    xattr /Applications/Claudesk.app | grep -i quarantine && echo "STILL QUARANTINED — re-run xattr" || echo "clear"
    open -a /Applications/Claudesk.app
    ```

    Order matters: **quit → upgrade → clear quarantine → THEN reopen.** Clearing the
    xattr before relaunch avoids the Gatekeeper block (a second apparent "crash"). If
    a pre-publish manual `cp` of the build into `/Applications` happened, brew's
    receipt lags the bundle until this upgrade re-syncs it — that mismatch alone is
    not an error.

    **Why operator-run, not agent-run:** the release's correctness is already proven by
    the clean build (Step 3), the resolving asset URL (Step 7), and the clean
    `brew audit`/`brew style` (Step 8) — none of which touch the running app. The local
    `brew upgrade` only re-confirms the operator's *own* install path, and its
    app-killing side effect makes it unsafe to run from within the release session. The
    operator gets the same confidence by running the block by hand once, decoupled from
    the live session.

12. **Clean up the transient manifest, then report.** Remove the repo-root
    `latest.json` (it's already uploaded to the release; leaving it dirties the working
    tree and would trip the clean-tree precondition on the next run — it's also
    gitignored as a backstop):

    ```bash
    rm -f latest.json
    ```

    Then **report** to the operator: the release URL, the tap cask commit, and the
    one-paste install command. Record the build time in `runtimes.md` if it was a
    fresh measurement.

## Notes & gotchas (learned 2026-06-24 on the v0.1.0 cut)

- **Step 11 is operator-run, never agent-run (SOP, 2026-06-27 v0.2.1 cut).** `brew upgrade --cask` removes the live `/Applications/Claudesk.app` and writes a fresh, re-quarantined bundle — so any open Claudesk dies mid-upgrade. Because `/release` is almost always driven from a Claude Code session running *inside* Claudesk, the agent running the upgrade would kill its own session. **So the agent does NOT run it** — it prints the quit→upgrade→xattr→reopen block (Step 11) and the operator runs it by hand in Terminal.app after the session. The release's correctness is already proven by the clean build + resolving asset URL + clean audit/style (none touch the running app); the local upgrade only re-confirms the operator's own install and is unsafe in-session. (Earlier cuts had the agent run it with a "quit Claudesk yourself" warning — superseded: the kill is unavoidable and takes the session with it, so hand it off instead.) Also: a pre-publish manual `cp` of the build into `/Applications` leaves brew's receipt lagging the bundle until the operator's upgrade re-syncs it — that mismatch alone is not an error.
- **Homebrew 6.x removed `--no-quarantine`.** Do NOT put
  `brew install --cask --no-quarantine claudesk` in release notes or the README — it
  errors with _"invalid option: --no-quarantine"_. The reliable path is plain
  `brew install --cask claudesk` then
  `xattr -dr com.apple.quarantine /Applications/Claudesk.app`. (Signing + notarization
  will remove this step entirely — a deferred M9 upgrade.)
- **Third-party-tap trust gate.** Recent Homebrew refuses casks from untrusted
  taps. Friends run `brew trust --cask StaymanHou/claudesk/claudesk` once. Keep
  this in the tap README's install block.
- **Cask `verified:` param.** Don't add `verified:` to the `url` when the url
  domain == homepage domain (both `github.com`) — `brew audit` rejects it as
  unnecessary.
- **`brew audit`/`brew style` read the INSTALLED tap copy**, not your working tree.
  Always `cp` your edited `claudesk.rb` into
  `$(brew --repository)/Library/Taps/staymanhou/homebrew-claudesk/Casks/` before
  auditing, or push first and `brew update`.
- **Two repos, two pushes.** The app code/tag/release goes to `StaymanHou/Claudesk`;
  the cask bump goes to `StaymanHou/homebrew-claudesk` via `git -C homebrew-claudesk`.
  They are independent repos nested on disk (the tap is gitignored by claudesk) — a
  push to one never touches the other.
- **Unsigned, Apple-Silicon-only.** Still no Apple code-signing / notarization
  (LOCKED at M10: stay unsigned + minisign — see `docs/product/arch.md` → "Milestone 10").
  The Gatekeeper `xattr` step therefore stays for `.dmg`/Homebrew first-installs. In-app
  self-updates (below) clear their own quarantine post-install (M10 WP1/WP2); the
  self-clear's live verdict lands at M10 WP6. *(Supersedes the earlier "No `tauri-plugin-updater`
  yet — friends re-`brew upgrade`" note — the updater shipped at M10 WP2.)*
- **Updater signing (M10 WP5) — two gotchas that silently break updates if missed.**
  1. **`TAURI_SIGNING_PRIVATE_KEY` is the key CONTENTS (a string), NOT a path.** The build's
     integrated sign step reads `TAURI_SIGNING_PRIVATE_KEY` (+ `..._PASSWORD`). If you set
     only `TAURI_SIGNING_PRIVATE_KEY_PATH`, the build **completes bundling then exits 1** with
     _"A public key has been found, but no private key…"_ and ships an **unsigned** `.tar.gz`
     (no `.sig`). Always `export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.claudesk-release-keys/claudesk-release.key)"`
     (step 3). The `.sig`-present guard in step 3 catches a missed export.
  2. **`latest.json` `signature` = the `.sig` contents VERBATIM — do NOT re-base64-encode.**
     Tauri's `.sig` is already base64; the updater plugin base64-**decodes** the field once at
     verify time. Re-encoding → `Signature::decode` fails → every update is rejected. Step 5b's
     `--arg sig "$SIG"` passes it as-is; the `diff` sanity-check confirms byte-identity.
- **First updatable release is the FLOOR, not retroactive.** The in-app updater only updates
  *from* a build that already contains it (M10 WP2 = the first). The first `/release` cut after
  M10 ships is the floor: it publishes the updater artifacts, but users on older builds (v0.2.x)
  must `brew upgrade` / re-download **once** to land on an updater-capable version — thereafter
  they self-update. A **key rotation** (changing `plugins.updater.pubkey`) resets this floor:
  builds signed with the old key can't verify a new-key update, so a rotation also forces a
  one-time `brew upgrade`/re-download. Keep the key (`774E2E8429FDF78A`) stable across releases.
- **Homebrew installs never self-update — detect-and-defer (M10 WP3).** A brew-cask install of
  Claudesk resolves to a `/Caskroom/` path; the updater detects this and **defers to `brew
  upgrade`** rather than self-installing (avoids brew version desync). So the tap-cask bump
  (steps 8–10) remains the update path for brew users; the in-app updater serves direct-download
  installs only. Nothing to do here beyond the normal cask bump — noted so the two paths aren't
  conflated.
