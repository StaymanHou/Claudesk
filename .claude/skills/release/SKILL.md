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

- **Apple Developer ID signing identity + notarization credential present** (M14 WP2,
  2026-09-18). Claudesk is **signed and notarized** as of v0.5.2 — these are hard
  preconditions, not optional extras.

  ```bash
  security find-identity -v -p codesigning | grep "Developer ID Application"
  xcrun notarytool history --keychain-profile "claudesk-notary" >/dev/null && echo "notary OK"
  ```

  ⚠️ **Both must succeed before you start.** The first must print exactly one
  `Developer ID Application: …` line; the second is a real authenticated round-trip to
  Apple (it prints submission history, or "No submission history" on a fresh account —
  both are success; an auth failure is not).

  ⚠️ **`security find-identity -v` reporting `0 valid identities` while the cert IS in
  Keychain Access means Apple's G2 intermediate is missing**, not that the cert is bad.
  Symptom chain: red "certificate is not trusted" in Keychain Access → `codesign` fails
  with `unable to build chain to self-signed root` → `errSecInternalComponent`. Fix
  (idempotent, no sudo, login keychain only):

  ```bash
  curl -fsSL -o /tmp/DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
  security import /tmp/DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
  ```

  ⚠️ **Do NOT validate the identity with `security verify-cert`** — it uses a different
  trust evaluation and returns "verification successful" in exactly the state where
  `codesign` cannot build the chain. A false all-clear. Test-sign a throwaway binary
  instead, or just trust `find-identity -v`.

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
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Yuechen Hou (C8RJH77B47)"
   ```

   (The private key + its password live in `~/.claudesk-release-keys/` — see "Updater
   signing key" in Preconditions. Both are read as file CONTENTS via `$(cat …)`; never
   echo either value, never paste it into a committed file.)

   ⚠️ **`APPLE_SIGNING_IDENTITY` is deliberately an env var, not `tauri.conf.json`.**
   The tracked config carries only `bundle.macOS.hardenedRuntime` + `.entitlements`, so
   the repo stays machine-independent and `pnpm tauri:dev` keeps working for anyone
   without the cert. Setting `signingIdentity` in the config would break a contributor's
   dev build.

   ⚠️ **Notarization is a SEPARATE step (5c), deliberately not wired into the build.**
   Tauri *can* notarize during `tauri build` if `APPLE_ID` + `APPLE_PASSWORD` +
   `APPLE_TEAM_ID` are exported — but when they are **absent it prints
   `Warn skipping app notarization` and STILL EXITS 0**. That failure mode ships an
   un-notarized build that looks like a successful release. This skill therefore
   notarizes explicitly in step 5c and *verifies* in step 5d, where a miss is loud.

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

   **Confirm the build was Apple-signed** (this is separate from minisign):

   ```bash
   codesign -dv --verbose=2 src-tauri/target/release/bundle/macos/Claudesk.app 2>&1 \
     | grep -E "flags=|Authority=Developer ID Application"
   ```

   ⚠️ Expect `flags=0x10000(runtime)` **and** an `Authority=Developer ID Application: …`
   line. ⚠️ **Do NOT check `$?` here** — `codesign` **exits 0 even when signing failed**,
   leaving the previous signature in place. The `Authority=` lines are the evidence.
   If they are absent, `APPLE_SIGNING_IDENTITY` was not exported into the build's shell.

3b. **Notarize the `.dmg` and staple both artifacts.** ⚠️ **This step is why the release
   no longer needs an `xattr` workaround** — `spctl` only reports
   `source=Notarized Developer ID` once the ticket is stapled.

   ```bash
   xcrun notarytool submit src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg \
     --keychain-profile "claudesk-notary" --wait
   ```

   This uploads to Apple and blocks until a verdict (typically 1–5 min; it has taken
   longer). Pass an explicit Bash `timeout` of 600000 ms. The final line must read
   `status: Accepted`.

   ⚠️ **If the status is `Invalid`**, get the reason before changing anything —
   `xcrun notarytool log <submission-id> --keychain-profile "claudesk-notary"`. The
   usual causes are a missing hardened runtime or an unsigned nested binary, both of
   which are build-config problems, not notarization problems.

   Then staple the ticket to **both** artifacts:

   ```bash
   xcrun stapler staple src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg
   xcrun stapler staple src-tauri/target/release/bundle/macos/Claudesk.app
   ```

3c. **⚠️ RE-TAR AND RE-SIGN THE UPDATER PAYLOAD — do not skip this.** Tauri builds
   `Claudesk.app.tar.gz` **during** the build, i.e. **before** step 3b stapled the
   `.app`. The tarball on disk therefore contains an **unstapled** app, and its `.sig`
   was computed over those stale bytes. Shipping it means every self-updating user
   receives an app whose Gatekeeper check must go **online** to fetch the ticket — which
   fails offline and re-introduces exactly the first-launch friction this milestone
   deleted.

   ```bash
   (cd src-tauri/target/release/bundle/macos && tar -czf Claudesk.app.tar.gz Claudesk.app)
   ./node_modules/.bin/tauri signer sign \
     -k "$TAURI_SIGNING_PRIVATE_KEY" -p "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD" \
     src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz
   ```

   ⚠️ **Order is load-bearing: staple → re-tar → re-sign.** Re-tarring invalidates the
   original `.sig` (different bytes), so the re-sign is mandatory, not optional. Verify
   the payload actually carries the ticket:

   ```bash
   rm -rf /tmp/tarcheck && mkdir -p /tmp/tarcheck
   tar -xzf src-tauri/target/release/bundle/macos/Claudesk.app.tar.gz -C /tmp/tarcheck
   xcrun stapler validate /tmp/tarcheck/Claudesk.app && rm -rf /tmp/tarcheck
   ```

   ⚠️ **`does not have a ticket stapled to it` means you skipped or mis-ordered 3c.**

3d. **Verify the release artifacts — all three checks, all required.**

   ```bash
   codesign --verify --deep --strict --verbose=2 src-tauri/target/release/bundle/macos/Claudesk.app
   spctl -a -t exec -vvv src-tauri/target/release/bundle/macos/Claudesk.app
   xcrun stapler validate src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg
   ```

   ⚠️ **`codesign` alone does not prove notarization.** The decisive line is `spctl`
   printing **`source=Notarized Developer ID`** — if it says `source=Developer ID`
   (no "Notarized"), the ticket is missing and users will hit Gatekeeper. STOP and
   redo 3b–3c rather than publishing.

4. **Compute the SHA-256** (the cask needs it; keep the hash):

   ```bash
   shasum -a 256 src-tauri/target/release/bundle/dmg/Claudesk_${VER}_aarch64.dmg
   ```

5. **Draft the release notes from the CHANGELOG.** Read `CHANGELOG.md` and collect
   the entries added since the previous release tag (`git tag --sort=-v:refname` →
   the tag before `vVER`; `git log <prevtag>..HEAD` to see what landed). Draft a
   short release-notes body summarizing those entries, and **always append the
   standard install block**:

   ```
   Install via the tap: `brew tap StaymanHou/claudesk && brew trust --cask StaymanHou/claudesk/claudesk && brew install --cask claudesk`
   ```

   ⚠️ **The unsigned-build caveat is GONE as of v0.5.2** (M14 WP2). Builds are
   Developer-ID signed and Apple-notarized, so Gatekeeper admits them unaided.
   **Do not re-add an `xattr -dr com.apple.quarantine` line to release notes** — it
   would instruct users to work around a problem that no longer exists, and it teaches
   a habit that weakens Gatekeeper for unrelated software.

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
    # verify, then reopen:
    brew list --cask --versions claudesk   # must read: claudesk VER
    /usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" /Applications/Claudesk.app/Contents/Info.plist  # VER
    spctl -a -t exec -vvv /Applications/Claudesk.app 2>&1 | grep source=   # want: source=Notarized Developer ID
    open -a /Applications/Claudesk.app
    ```

    Order is now simply **quit → upgrade → reopen** (M14 WP2). ⚠️ **The `xattr -dr`
    step is GONE** — the build is notarized, so Gatekeeper admits it without a manual
    quarantine clear. The `spctl` line replaces it as the check: it should print
    `source=Notarized Developer ID`. If it prints anything else, the published artifact
    was not stapled — investigate before telling users to install it, and **do not
    reach for `xattr` as a remedy**. If a pre-publish manual `cp` of the build into
    `/Applications` happened, brew's receipt lags the bundle until this upgrade
    re-syncs it — that mismatch alone is not an error.

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

- **Step 11 is operator-run, never agent-run (SOP, 2026-06-27 v0.2.1 cut).** `brew upgrade --cask` removes the live `/Applications/Claudesk.app` and writes a fresh, re-quarantined bundle — so any open Claudesk dies mid-upgrade. Because `/release` is almost always driven from a Claude Code session running *inside* Claudesk, the agent running the upgrade would kill its own session. **So the agent does NOT run it** — it prints the quit→upgrade→reopen block (Step 11) and the operator runs it by hand in Terminal.app after the session. The release's correctness is already proven by the clean build + resolving asset URL + clean audit/style (none touch the running app); the local upgrade only re-confirms the operator's own install and is unsafe in-session. (Earlier cuts had the agent run it with a "quit Claudesk yourself" warning — superseded: the kill is unavoidable and takes the session with it, so hand it off instead.) Also: a pre-publish manual `cp` of the build into `/Applications` leaves brew's receipt lagging the bundle until the operator's upgrade re-syncs it — that mismatch alone is not an error.
- **Homebrew 6.x removed `--no-quarantine`.** Do NOT put
  `brew install --cask --no-quarantine claudesk` in release notes or the README — it
  errors with _"invalid option: --no-quarantine"_. ⚠️ **The flag is still gone, but the
  reason it mattered is not:** as of v0.5.2 the build is notarized, so plain
  `brew install --cask claudesk` just works with **no follow-up command at all**.
  (Signing + notarization
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
- **⚠️ SIGNED + NOTARIZED as of v0.5.2 — this REVERSES the M10 decision (M14 WP2,
  2026-09-18).** Builds are Developer-ID signed with the hardened runtime and
  Apple-notarized, so `spctl` reports `source=Notarized Developer ID` and Gatekeeper
  admits them unaided. **The `xattr` step is deleted everywhere** — from release notes,
  the README, and the Step 11 upgrade block — and the updater's post-install
  self-quarantine-clear was removed with it. ⚠️ **minisign is RETAINED, not replaced:**
  the two systems are independent (minisign verifies the *updater payload* inside
  `download()`; notarization satisfies *Gatekeeper* via a stapled ticket), and the trust
  anchor `774E2E8429FDF78A` is **unchanged** — changing it would strand every existing
  install. Apple-Silicon-only is unchanged. See
  `workflow-system/product/arch/build-update-release.md`.
  *(Supersedes both the earlier "No `tauri-plugin-updater` yet — friends re-`brew upgrade`"
  note (the updater shipped at M10 WP2) and the M10 "stay unsigned + minisign" lock.)*
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
