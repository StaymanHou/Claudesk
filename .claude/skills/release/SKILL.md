---
name: release
description: Cut a new Claudesk release — bump the version, clean-build the .dmg, publish a GitHub release, and bump the Homebrew tap cask. MANUAL-ONLY; invoke by hand when the operator says "cut a release" / "ship a release" / "/release". NEVER auto-invoked by feature-ship or product-finalize.
---

# Release Claudesk

Drives a full Claudesk release end-to-end: bump the version, do a clean production
build, tag the commit, publish a GitHub release with the `.dmg` asset, and update
the Homebrew tap cask (`StaymanHou/homebrew-claudesk`) so `brew install --cask
claudesk` picks up the new version.

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

## Inputs

- **Version** — e.g. `0.1.1`. Ask the operator if not given. Throughout these steps,
  let `VER` be the version (no leading `v`); the git tag is `vVER`.

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

3. **Clean build.** A full cold rebuild guarantees no stale-cache artifact ships:

   ```bash
   (cd src-tauri && cargo clean)
   pnpm tauri build
   ```

   This is a **long** cold build (multi-minute — likely 3–8 min). Pass an explicit
   Bash `timeout` (consult `runtimes.md` for the recorded `pnpm tauri build` time;
   if absent, use 600000 ms — the Bash max — and record the observed time to
   `runtimes.md` afterward). The artifact lands at:
   `src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg`
   Confirm it exists.

4. **Compute the SHA-256** (the cask needs it; keep the hash):

   ```bash
   shasum -a 256 src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg
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

6. **⏸ GATE 1 — confirm before publishing.** Show the operator:
   - the built `.dmg` path + its size + the sha256, and
   - the full drafted release notes.

   Wait for explicit approval (and apply any edits the operator gives). Do NOT run
   step 7 until they say go — step 7 publishes publicly.

7. **Tag + publish the GitHub release:**

   ```bash
   git tag vVER
   git push origin vVER
   gh release create vVER \
     "src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg" \
     --title "Claudesk vVER" \
     --notes "<the approved notes from step 6>"
   ```

   Confirm the asset URL resolves:

   ```bash
   gh release view vVER --json assets --jq '.assets[].url'
   ```

   It will be:
   `https://github.com/StaymanHou/Claudesk/releases/download/vVER/Claudesk_VER_aarch64.dmg`

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

12. **Report** to the operator: the release URL, the tap cask commit, and the
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
- **Unsigned, Apple-Silicon-only, v1.** No `tauri-plugin-updater` yet — friends
  re-`brew upgrade` to update (and re-run the `xattr` step). These are the deferred
  M9 signing/auto-update upgrades, not v1 scope.
