---
name: release
description: Cut a new Claudesk release — build the .dmg, tag, publish a GitHub release, and bump the Homebrew tap cask. MANUAL-ONLY; invoke by hand when the operator says "cut a release" / "ship a release" / "/release". NEVER auto-invoked by feature-ship or product-finalize.
---

# Release Claudesk

Drives a full Claudesk release end-to-end: build the production `.app`/`.dmg`,
tag the commit, publish a GitHub release with the `.dmg` asset, and update the
Homebrew tap cask (`StaymanHou/homebrew-claudesk`) so `brew install --cask
claudesk` picks up the new version.

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

- Working tree is clean and the release commit is already on `main` and **pushed**
  to `origin` (this skill releases what's on the remote; it does not push code for
  you beyond the tag).
- `gh` is installed and authenticated (`gh auth status`). If missing:
  `brew install gh && gh auth login` (the auth is interactive — the operator runs it).
- Apple Silicon host (the build produces an `aarch64` `.dmg`).
- The tap repo lives at `homebrew-claudesk/` **nested inside this project** (its own
  independent git repo; gitignored by the canonical claudesk repo). If absent, clone it
  there: `gh repo clone StaymanHou/homebrew-claudesk homebrew-claudesk`.

## Inputs

- **Version** — e.g. `0.1.1`. Ask the operator if not given. Must match the version
  in `src-tauri/tauri.conf.json` (`version` field) and `src-tauri/Cargo.toml`
  (`package.version`). If they disagree with the requested version, STOP and ask —
  do not silently bump.

## Steps

Run from the project root (`/Users/stayman/Personal/projects/claudesk`). Let
`VER` be the version (no leading `v`); the git tag is `vVER`.

1. **Confirm the version is consistent.** Read `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`; confirm both carry `VER`. If a bump is needed, edit both,
   then commit (`Release vVER`) and `git push origin main` — the release must point
   at a pushed commit.

2. **Build the production bundle:**

   ```bash
   pnpm tauri build
   ```

   This is a long build — pass an explicit Bash `timeout` (consult `runtimes.md`;
   estimate generously if absent). The artifact lands at:
   `src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg`
   Confirm it exists and note its path.

3. **Compute the SHA-256** (the cask needs it):

   ```bash
   shasum -a 256 src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg
   ```

   Keep the hash.

4. **Tag and push the tag:**

   ```bash
   git tag vVER
   git push origin vVER
   ```

5. **Create the GitHub release with the `.dmg` asset:**

   ```bash
   gh release create vVER \
     "src-tauri/target/release/bundle/dmg/Claudesk_VER_aarch64.dmg" \
     --title "Claudesk vVER" \
     --notes "<one-paragraph summary of what's in this release + the unsigned-install note>"
   ```

   The notes should always carry the unsigned-build caveat (the
   `xattr -dr com.apple.quarantine` one-liner) since the build is unsigned. Confirm
   the asset download URL:

   ```bash
   gh release view vVER --json assets --jq '.assets[].url'
   ```

   It will be:
   `https://github.com/StaymanHou/Claudesk/releases/download/vVER/Claudesk_VER_aarch64.dmg`

6. **Bump the tap cask.** In `homebrew-claudesk/Casks/claudesk.rb` (nested in this
   project), update:
   - `version "VER"`
   - `sha256 "<hash from step 3>"`

   The `url` is version-interpolated (`v#{version}` / `#{version}`), so it does not
   need editing. Then validate and push:

   ```bash
   # validate against the installed tap copy
   cp homebrew-claudesk/Casks/claudesk.rb \
      "$(brew --repository)/Library/Taps/staymanhou/homebrew-claudesk/Casks/claudesk.rb"
   brew audit --cask staymanhou/claudesk/claudesk    # must be clean (no output)
   brew style staymanhou/claudesk/claudesk           # must be clean

   git -C homebrew-claudesk commit -am "claudesk VER"
   git -C homebrew-claudesk push origin HEAD
   ```

   Note: the tap remote is SSH (`git@github.com:StaymanHou/homebrew-claudesk.git`).
   If a fresh clone came down over HTTPS, switch it:
   `git remote set-url origin git@github.com:StaymanHou/homebrew-claudesk.git`.

7. **Smoke-test the install path** (the definitive check that friends' install works):

   ```bash
   brew update
   brew upgrade --cask claudesk   # or `reinstall` if already at this version
   xattr -dr com.apple.quarantine /Applications/Claudesk.app
   ```

   Confirm the app launches.

8. **Report** the release URL, the cask commit, and the install command to the operator.

## Notes & gotchas (learned 2026-06-24 on the v0.1.0 cut)

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
- **Unsigned, Apple-Silicon-only, v1.** No `tauri-plugin-updater` yet — friends
  re-`brew upgrade` to update (and re-run the `xattr` step). These are the deferred
  M9 signing/auto-update upgrades, not v1 scope.
