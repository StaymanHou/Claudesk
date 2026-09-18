---
stage: wbs
state: in-progress
milestone: M14 (remainder)
created: 2026-09-15
updated: 2026-09-17
---

# WBS — Milestone 14 (remainder): Polish & Open-Source Release

> ⚠️ **This decomposes M14's REMAINDER, not M14.** M14 was **SPLIT 2026-09-06**: its release half
> (MIT LICENSE + README correctness pass + release note) shipped as a single task, deliberately
> skipping `/product-wbs`, and was delivered in **`v0.4.0`**. Two of its four roadmap deliverables
> are already `[x]`. **Do not decompose M14 as a whole and do not re-plan the shipped half.**
>
> ⭐ **Sequenced ahead of the supervisor dogfeedback** because it does not depend on the dogfooding
> wall-clock (`roadmap.md` → Revision 2026-09-15). M15 closed 2026-09-15; `v0.5.0` is cut.

## Scope as ruled this session (2026-09-15)

Four deliverables remained. Two operator rulings taken at decomposition changed the shape of the
milestone, and both are recorded here because **each reverses or narrows a written prior position**:

| # | Deliverable | Ruling |
|---|---|---|
| 1 | **Signing + notarization** | ⚠️ **REVERSED** — enroll, sign, notarize. See R-1 below. |
| 2 | **Settings UI** | ⚠️ **NARROWED to hotkeys only** — project-list management **dropped**. See R-2. |
| 3 | **Two-tier setup docs** | Unchanged — full buildout; the 2026-09-06 correctness pass was partial. |
| 4 | **Repo description/topics** | Unchanged — trivial, a `gh repo edit` call. Sized XS; **do not inflate.** |

### R-1 — Signing: the M10 "stay unsigned" decision is REVERSED (operator, 2026-09-15)

⚠️ **This overturns a recorded architectural decision. It is not a new decision in a vacuum.**
`arch/build-update-release.md` records:

> **Unsigned + minisign, not notarized.** … macOS *notarization* ($99/yr) is separate and **NOT
> purchased**. Consequence — the self-quarantine-clear mechanism — is a deliberate accepted cost of
> staying unsigned. Revisit notarization later (a future call, not M10).

and reconciled M14's deliverable down to *"inherit and document that decision"*, explicitly noting
that **"a future notarize-yes reversal (and its removal of the self-quarantine-clear step) would
live at M14."** That reversal is now taken. M14's signing deliverable is therefore **an
implementation WP, not a documentation WP** — the opposite of what the reconciliation assumed.

- ⚠️ **The operator is NOT currently enrolled** in the Apple Developer Program. Enrollment (~$99/yr)
  is an **operator-gated prerequisite an agent cannot perform**. It is task 1.1 and it **gates WP2
  entirely**. ⚠️ **CORRECTED 2026-09-15 by the WP1 research pass: the "24–48h" figure is APPLE'S
  PUBLISHED LINE, NOT the observed one.** Apple says contact them if unconfirmed after 24h, but 2026
  community reports describe individual enrollments **stuck 2–7+ weeks** with no communication.
  **Plan for the long case.** Account type was ruled **Individual / Sole Proprietor**, so **no
  D-U-N-S is involved** (that applies only to an Organization enrollment, which was declined).
  Full runbook: the operator runbook under WP1's tasks.
- ⚠️ **minisign STAYS. Notarization is ADDITIVE, not a replacement.** The two signing systems are
  independent: minisign (key `774E2E8429FDF78A`, free) verifies *updater artifact authenticity*;
  Apple notarization satisfies *Gatekeeper*. ⚠️ **The trust anchor must not change** — it has been
  unchanged since `v0.2.9` and every existing install self-updates through it. Touching it strands
  installed users.
- **The payoff is deletion, and it is large.** Signing removes: `clear_own_quarantine` /
  `quarantine_clear_command` / `resolve_bundle_path` (`src-tauri/src/updater/mod.rs`), the
  `QUARANTINE_FALLBACK_ACTIVE` seam + its fallback dialog (`src/App.tsx`, `src/updater/
  updateFlowState.ts`, `useUpdater.ts`, 2 test files), and **six README sites** telling a stranger
  to run `xattr -dr com.apple.quarantine`. The README already forward-references this work as
  *"deferred to a later polish milestone."*

### R-2 — Settings: hotkeys only; project-list management DROPPED (operator, 2026-09-15)

M14's Settings line named two things. The operator kept **hotkey configuration** and **dropped
project-list management** from the milestone. ⚠️ **Dropped ≠ backlogged-with-a-plan** — if it is
wanted later it re-enters as new work, not as an unticked M14 leftover.

⚠️ **EXTEND the `⌘,` panel, do not rebuild it.** M10.9 WP2 shipped the panel, its four labelled
groups, and the `workflow_features_enabled` toggle. This adds a group to an existing surface.

### Correction booked into this milestone (from `roadmap.md`)

- ⚠️ **M14's "default CLI args for `claude`" Settings line is STALE and must be corrected when
  touched** — M11.5 consumed most of it, and it still misstates **PiP (shipped M5)** and
  **permission-mode (shipped M6)** as future work. Task 4.2.
- ⚠️ **`arch/build-update-release.md`'s "Unsigned + minisign" decision + its "M14 overlap —
  reconciled" bullet must be rewritten** to record the R-1 reversal. Task 2.6. **Leaving them
  stating the superseded decision is the `doc-correction-scope-list-is-a-floor` failure mode.**

## Design-priors consult

Two recorded priors bear on this decomposition.

- **[PRIOR: `explicit-selectable-mode-over-inferred-mode`] — fires on WP3 (hotkeys), rule 3 (breaks
  a genuine tie), leaning to the LOW-SURFACE version.** Its load-bearing clause is a
  **risk-surface-vs-value calculus**: *"When a feature's value is unclear or low … prefer the
  lower-UI/UX-bug-surface implementation … Prove the value at the low-surface version first;
  escalate only when demand is real."* A full record-any-chord rebinding editor is the high-surface
  version (capture mode, modifier normalization, reserved-range enforcement, per-workspace vs
  global scope, conflict resolution UI, persistence migration). ⚠️ **A hotkey editor's value here
  is operator-unproven** — this is a friend-facing affordance; the operator's own bindings already
  work. **WP3 is therefore scoped to the low-surface version** (see WP3). **Flag if wrong.**
- **[PRIOR: `gate-substrate-dependent-feature-class-behind-default-off-opt-in`] — fires on WP4
  (setup docs), rule 2 (agrees with the common-sense default).** The two-tier doc structure *is*
  this prior's shape: tier 1 = the lite-IDE core that works on a bare install; tier 2 = the opt-in
  `workflow_features_enabled` layer + the evangelistic on-ramp. The docs must **document the gate as
  a first-class concept**, not bury the workflow features as undocumented extras. Higher confidence,
  no scope change.
- **Over-infer guard applied:** neither prior governs the *signing* decision (a
  release-infrastructure/cost tradeoff, not a product-design one → `arch.md` territory per the
  capture contract's exclusions), and neither governs repo metadata. WP1/WP2/WP5 fill from common
  sense.

## Work packages

### WP0: Supervisor hotfix — per-workspace toggle + unsent-input suppression 🔥 URGENT ✅ SHIPPED 2026-09-17 (commit a46ae89)
> ✅ **ALL 7 TASKS COMPLETE — `v0.5.1` released 2026-09-17** (the earlier "0.7 deliberately
> unticked" note is discharged). ⚠️ **But the WP's own warning still stands one step further out:**
> a cut release is not an *installed* one. Until the operator runs `brew upgrade` (Step 11 is
> operator-run by design — `brew upgrade --cask` kills the running Claudesk, and `/release` is
> driven from inside it), their app still runs the UNFIXED supervisor, and Phase 1's 7
> `DEFERRED-TO-DOGFOODING` checks plus
> `SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1` stay unsatisfiable.
**Description:** The M15 supervisor is firing unwanted commands in live use. Give it a
per-workspace off switch and stop it firing when the operator has unsent input in the CC pane.
**Milestone:** M14 (remainder) — ⚠️ **INSERTED 2026-09-15 out of the original decomposition**
**Dependencies:** none — ⚠️ **preempts WP1/WP2/WP3**
**Size:** S
**Origin:** ⚠️ **NOT a planned work package.** Operator dogfeedback on `v0.5.0`
(`SURFACE-2026-09-15-SUPERVISOR-DOGFEEDBACK-BATCH-1`, high) — *"it's making Claudesk a bit out of
control and less useful."* ⚠️ **The supervisor fired six unwanted `/feature-build` invocations
into this very session**, which is how the cause was identified. **9 of 20 projects carry a stored
drive mode**, so the blast radius is ~half the operator's rotation, not one workspace.

**Operator rulings taken 2026-09-15 (do not re-litigate):**
- ⚠️ **Toggle default is ON, opt-out per workspace** — NOT default-off. Consistent with
  `operator-helpful-friend-misfiring-as-offswitchable-setting`.
- ⚠️ **"While typing" is NOT good enough — the predicate is UNSENT INPUT PRESENT, not
  keystroke-recency.** Operator correction, and it is the load-bearing distinction: "typing" is a
  race on keystroke timing; "there is a buffered line you walked away from" is a state. A fix that
  only debounces recent keystrokes does not satisfy this ruling.
- ⚠️ **Do NOT flip `workflow_features_enabled` off as a stopgap** (operator, explicit). The blunt
  gate would also hide the Docs panel and the rest of the workflow surface. Fix it properly.
- **Fire policy is reopened LATER, after this patch ships** — see the note under WP2.

**Tasks:**
- [x] 0.1 Unsent-input watermark. Hook `term.onData` (`XtermPane.tsx:626` — the single chokepoint
      for every keystroke Claudesk forwards INTO the pty). Track input-since-turn-end with no
      `\r` since ⇒ unsent input present. ⚠️ **This reads what Claudesk sends IN, never PTY
      output** — `CLAUDE.md`'s *"PTY byte-injection for input; hook channel for state. ⚠️ NEVER
      from PTY output"* rule holds, and the `xterm-dom-reads-fake-a-blank-pane` false-verdict trap
      is avoided by construction. ⚠️ **Scraping the xterm buffer was CONSIDERED AND REJECTED** for
      exactly those two reasons.
- [x] 0.2 ⚠️ **Enumerate the input paths that BYPASS `term.onData` before trusting the watermark.**
      Paste, programmatic writes, and `injectCommand` itself may not route through it. **A
      suppression with an unknown blind spot is worse than none, because it will be trusted.**
      Report what is and is not covered rather than assuming full coverage.
- [x] 0.3 Consult the watermark in `fireOne` (`src/state/supervisor/fanOut.ts`) and skip the fire
      when unsent input is present. ⚠️ **`injectCommand` has no retry and no pre-send cancel
      window** — suppression must happen BEFORE the call, not be undone after.
- [x] 0.4 Per-workspace supervisor toggle, **default ON**, persisted in `projects.json`.
      ⚠️ **A malformed/absent value must read as ON, not crash the project list** — the
      picker-row drive-mode precedent (a bad mode string fails serde and takes the whole list
      down) applies.
- [x] 0.5 Surface the toggle where the operator can reach it *at the moment it misfires*.
      ⚠️ **`set-a-spawn-time-choice-where-the-spawn-is-chosen` does NOT govern this** — the
      supervisor is not read once at spawn; it acts every turn, so the control belongs where the
      operator is when it acts, not only on the picker row. Decide at spec/plan time.
- [x] 0.6 Tests: watermark state machine (input → no `\r` → suppressed; input → `\r` → not
      suppressed; turn-end resets), and toggle-gates-the-call. ⚠️ **Mutation-prove the suppression
      INDIVIDUALLY** — a suppression that never suppresses and one that always suppresses both
      look green against a test that only asserts "no fire happened".
- [x] 0.7 Ship as a patch release via `/release`. ✅ **`v0.5.1` cut 2026-09-17** — 25 commits since `v0.5.0`; four assets published and the updater endpoint confirmed resolving to 0.5.1; tap cask bumped (`298c3c5`). ⚠️ **The operator has NOT yet run `brew upgrade`** — until they do, their own Claudesk still runs the unfixed supervisor, so the 7 `DEFERRED-TO-DOGFOODING` checks remain unsatisfiable.

⚠️ **WHAT AN AGENT CANNOT VERIFY HERE, AND IT IS THE HALF THAT MATTERS.** An agent-launched CC
emits no hook events (`SURFACE-2026-09-13-AGENT-LAUNCHED-CC-CANNOT-PRODUCE-A-REAL-HOOK-EVENT`), so
the supervisor will not fire under agent testing. The predicate and the toggle wiring are unit-
provable; **"does it actually stop interrupting the operator" is a dogfooding check only the
operator can make.** Say which half is proven — do not present a green suite as evidence the
interruption stopped.

**WP0 → WP1 rationale:** WP0 preempts the signing chain because the supervisor is actively
degrading daily use, and because the patch should ride with — or deliberately precede — the signed
release the operator will install anyway. Installing means `brew upgrade`, which kills every
running Claudesk, so the operator pays that cost once rather than twice.

---

### WP1: Probe — Apple Developer enrollment, cert issuance, and the notarization toolchain ✅ **COMPLETE 2026-09-18 — VERDICT: GO**
**Type:** probe
**Milestone:** M14 (remainder)
**Dependencies:** none — **this is the gate for WP2**
**Size:** S (agent effort) — ⚠️ **but wall-clock-gated by Apple's approval, which is 24h published
and reportedly 2–7+ weeks in practice (2026)**
**Learning objective:** Can we actually sign and notarize, what exactly does the pipeline require,
and does notarization interact with the shipped minisign updater in any way that breaks existing
installs?
**Timebox:** agent work ≤ half-day once the cert exists; **calendar-gated by enrollment approval**
**Success criterion:** A Developer ID Application certificate is present in the login keychain and
verified (`security find-identity -v -p codesigning` shows it); the exact `tauri.conf.json`
`bundle.macOS` keys, entitlements file, and `notarytool` credential mechanism are documented; and
the minisign-vs-notarization independence is confirmed **by reasoning about the shipped
`v0.5.0` updater path**, not assumed.

⚠️ **This is a probe, not a build WP, for a specific reason:** `bundle.macOS` is currently **`{}`**
(empty — verified 2026-09-15) and the `/release` skill has **zero** signing references, so every
shape here is currently unknown. Committing WP2's tasks before the cert exists would be planning
against assumed shapes — the exact 3rd-party-integration gap §4 of the WBS procedure forbids.

**Tasks:**
- [x] 1.1 ✅ **DONE 2026-09-15 — ENROLLMENT APPROVED.** Payment submitted and the Apple Developer
      account came back ready **the same day** — far inside the 24h published line and nowhere near
      the 2–7 week figure 2026 community reports warned of. ⚠️ **The long pole turned out to be
      short; do not read the earlier warning as having been wrong — it was the right planning
      posture, and WP3/WP5 were correctly sequenced as parallel tracks against it.**
      ⚠️ **Approved ≠ signable:** `security find-identity -v -p codesigning` still reports
      **0 valid identities**, so **task 1.2 (create the Developer ID Application certificate) is
      the live blocker** and WP2 stays gated until task 1.3 sees an identity.
      ⚠️ **OPERATOR TASK — an agent cannot do this.** Enroll in the Apple Developer Program
      ($99/yr). **Blocks everything in WP2.** Surface the approval latency to the operator at the
      start, not when WP2 stalls. ⚠️ **24h is Apple's published line; 2026 reports describe 2–7+
      weeks.** See the operator runbook below.
- [x] 1.2 ✅ **DONE 2026-09-18.** Developer ID Application cert created (G2 Sub-CA) and installed
      to the login keychain by the operator. ⚠️ **OPERATOR TASK.** Create a Developer ID Application certificate (CSR via Keychain
      Access → developer.apple.com → download → install to login keychain). ⚠️ **Developer ID
      Application is the correct type** — *not* "Mac App Distribution" (App Store only) and *not*
      "Developer ID Installer" (`.pkg` only). The wrong cert type signs but fails notarization.
- [x] 1.3 ✅ **DONE 2026-09-18.** Identity `06668AEBC6FB91019064E09A09938EA8F9302CC6` =
      `Developer ID Application: Yuechen Hou (C8RJH77B47)`, Team ID `C8RJH77B47`, issuer OU=G2,
      EKU=Code Signing (critical), expires 2031-09-17.
      ⚠️ **GOTCHA — the `.cer` download does NOT install Apple's G2 intermediate.** Symptom:
      Keychain Access shows red *"certificate is not trusted"*; `security find-identity -p
      codesigning` LISTS the identity but `-v` reports **0 valid identities**; `codesign` fails with
      `unable to build chain to self-signed root` → `errSecInternalComponent`.
      ⚠️ **`codesign` EXITED 0 on that failure** — the exit code lies; a failed sign leaves the
      ORIGINAL signature in place, so check the `Authority=` lines, not `$?`.
      ⚠️ **`security verify-cert -p codeSign` reported "verification successful" while `codesign`
      could not build the chain** — it uses a different trust evaluation and gives a FALSE
      ALL-CLEAR. Never validate a signing identity with it; test-sign a throwaway binary instead.
      Fix (idempotent, no sudo, login keychain only):
      `curl -fsSL -o DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer`
      then `security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db`.
- [x] 1.4 ✅ **DONE 2026-09-18.** Keychain profile `claudesk-notary` stored by the operator via
      `notarytool store-credentials` (app-specific password, NOT the Apple ID password); Apple
      validated it at store time and a read-only `notarytool history` round-trip confirmed it.
      **No credential in the repo.** Document the `notarytool` credential path. ⚠️ **Prefer an app-specific password +
      `notarytool store-credentials` keychain profile** over inlining an Apple ID password anywhere.
      ⚠️ **No credential may land in the repo** — record the mechanism, never the secret.
- [x] 1.5 ✅ **DONE 2026-09-18 — resolved from crate SOURCE, not the docs** (the docs pass was
      silent on the decisive default). `tauri-utils-2.9.2/src/config.rs` → `MacConfig`:
      `signingIdentity`, `hardenedRuntime`, `entitlements`, `providerShortName`, `infoPlist`,
      `minimumSystemVersion` (default "10.13"), `dmg`.
      ⚠️ **VERSION CORRECTION: the installed line is `tauri` + `tauri-cli` 2.11.2**, not 2.9.x —
      2.9.2 is the `tauri-utils` config crate, which is likely where the WBS's "2.9" came from.
      Env vars: `APPLE_SIGNING_IDENTITY`, `APPLE_CERTIFICATE`(+`_PASSWORD`, CI only); notarization
      via EITHER `APPLE_API_ISSUER`/`APPLE_API_KEY`/`APPLE_API_KEY_PATH` OR
      `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID`.
- [x] 1.6 ✅ **GO — 2026-09-18. No hardened-runtime regression found.**
      ⚠️ **KEY FINDING: `hardened_runtime` DEFAULTS TO `true`** (confirmed in both the serde
      `default = "default_true"` and `impl Default for MacConfig`). So the risk is **live the moment
      a signing identity is set** — it is not opt-in, and the Tauri docs never say so.
      Entitlements written to `src-tauri/Entitlements.plist` (4 keys): `allow-jit` +
      `allow-unsigned-executable-memory` (WKWebView JavaScriptCore), `disable-library-validation`
      (third-party CLIs we cannot sign), `allow-dyld-environment-variables` (env inheritance to
      children).
      **Evidence:** signed build → `flags=0x10000(runtime)`, chain leaf→Developer ID CA→Apple Root,
      `--verify --deep --strict` passes, all 4 entitlements confirmed via `codesign -d
      --entitlements`. Notarization submission `e582b857-7182-4fbd-a217-21aca518ef5f` → **Accepted**;
      stapled + `stapler validate` on BOTH `.dmg` and `.app`; `spctl -a` → **accepted,
      source=Notarized Developer ID** (this is what obsoletes the quarantine workaround).
      Installed `.app` launched via `open -n` (launchd minimal PATH, **not** `tauri:dev`) ran stable,
      zero crash reports, and spawned `/bin/zsh` children (env_path PATH capture) ⇒ fork/exec works.
      ⚠️ **PTY proven DIRECTLY:** a C harness signed with hardened runtime + Claudesk's exact
      entitlements ran `forkpty()` + `execlp(perl)` and read back `PTY_CHILD_OK`.
      **Why it passed:** hardened runtime restricts the SIGNED process (JIT / dylib loading), not its
      ability to fork/exec separately-signed or system binaries; the entitlements cover both places
      it does bite.
      ⚠️ **RESIDUAL RISK — carried to task 2.3, NOT covered by this GO:** `claude`, `subl` and
      `smerge` were **not** exercised end-to-end from the signed app (only `zsh` + `perl` were). A
      real CC session spawn from a signed installed build remains **unproven** — inference, not
      observation.
- [x] 1.7 ✅ **CONFIRMED INDEPENDENT — 2026-09-18.** The two signing systems touch different
      artifacts at different times and share no state:
      • **minisign** verifies the `.app.tar.gz` **inside `download()`**, over the downloaded buffer
        vs the configured `pubkey` (`updater/mod.rs`) — it is a **Tauri-plugin-level** check.
      • **Apple notarization** is a **Gatekeeper-level** check on the `.app`/`.dmg`, evaluated by
        the OS at launch/install, and is consumed via the **stapled ticket** — never by the updater.
      Notarizing changes the `.app`'s contents (signature + stapled ticket), so the tarball bytes
      differ and its minisign signature is recomputed at build time — but the **key that verifies it
      does not change**.
      ⚠️ **Verified empirically, not assumed:** the `pubkey` value is **byte-identical across
      `v0.2.9`, `v0.4.0`, `v0.5.0`, `v0.5.1` and the working tree** (1 unique value over all five).
      Anchor `774E2E8429FDF78A` intact ⇒ **no installed base is stranded**; a `v0.5.x` install
      verifies the first signed build with the key it already trusts.
      ⚠️ Still to be confirmed **live** at task 2.7 — this is the reasoning, not the migration run.
- [x] 1.8 ✅ **PROBE REPORT — VERDICT: GO (2026-09-18).**
      **Pipeline shape (proven end-to-end):** `pnpm tauri build` with `APPLE_SIGNING_IDENTITY` set →
      signed `.app` + `.dmg` → `notarytool submit --keychain-profile claudesk-notary --wait` →
      `stapler staple` both artifacts → `spctl -a` reports **`source=Notarized Developer ID`**.
      **Entitlements set:** the 4 keys in `src-tauri/Entitlements.plist` (see 1.6).
      **Config:** `bundle.macOS = { hardenedRuntime: true, entitlements: "Entitlements.plist" }`.
      ⚠️ **`signingIdentity` deliberately NOT in the tracked config** — passed via
      `APPLE_SIGNING_IDENTITY` so the repo stays machine-independent and `pnpm tauri:dev` keeps
      working for anyone without the cert (pre-answers task 2.1's dev-overlay question).
      **Surprises, all carried into WP2:**
      1. ⚠️ **Tauri SILENTLY SKIPS notarization** unless `APPLE_ID`+`APPLE_PASSWORD`+`APPLE_TEAM_ID`
         (or the API-key triad) are in env — it prints `Warn skipping app notarization`, **not an
         error**. A build can look successful and ship **un-notarized**. Task 2.4 must make this
         impossible to get wrong (fail loudly, or notarize as an explicit post-build step).
      2. `pnpm tauri build` **exits 1** without `TAURI_SIGNING_PRIVATE_KEY` — *after* bundling, so
         artifacts exist despite the failure.
      3. The G2-intermediate trust gotcha + the two false-instrument traps (see 1.3).
      4. Version correction: the installed line is **2.11.2**, not 2.9.x (see 1.5).

#### Operator runbook for tasks 1.1–1.2 + 1.4 (researched 2026-09-15; primary sources)

⚠️ **Toolchain is already ready** — full Xcode is installed and `notarytool` is present at
`/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool`. Nothing to install. Baseline at
decomposition: `security find-identity -v -p codesigning` → **`0 valid identities found`**.

**Account type ruled 2026-09-15: Individual / Sole Proprietor** (no D-U-N-S, signature reads as the
operator's own name). Organization was considered and declined.

**Step 0 — verify 2FA BEFORE paying.**  → System Settings → [name] → Sign-In & Security →
Two-Factor Authentication must read **On**. ⚠️ **Apple states 2FA is a hard prerequisite** for
enrollment ([developer.apple.com/help/account/membership/program-enrollment](https://developer.apple.com/help/account/membership/program-enrollment/)).

**Step 1 — enroll** at [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/)
→ Individual/Sole Proprietor → **$99 USD/yr**. ⚠️ **Legal name must match government ID exactly** —
a formatting mismatch triggers a manual photo-ID review that adds days. ⚠️ **Pay with the
operator's OWN credit card** — Apple states that an individual enrollment paid by someone else's
card is delayed *and* triggers a government-photo-ID request.

**Step 2 — wait.** ⚠️ **Apple's published line is "contact us if no confirmation within 24 hours",
but 2026 community reports describe individual enrollments stuck 2–7+ weeks with no
communication** (multiple Apple Developer Forums threads; non-US ~2 weeks). **Plan for the long
case — this is exactly why WP3 and WP5 exist as parallel tracks.** If a week passes with no word,
open a case at [developer.apple.com/contact](https://developer.apple.com/contact/); the forum
threads suggest silent stalls do not self-resolve.

**Step 3 — the certificate (task 1.2).** ⚠️ **A CSR from Keychain Access is STILL REQUIRED** — this
cert type is not Xcode-managed. Keychain Access → Certificate Assistant → *Request a Certificate
From a Certificate Authority* → email = Apple ID, Common Name = operator name, CA Email **blank**,
**Saved to disk**. Then [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
→ **+** → *Software* → **Developer ID** → **Developer ID Application** → upload CSR → Download →
double-click to install. ⚠️ **Account Holder role only** may create Developer ID certs (a non-issue
for a sole individual). ⚠️ **Limit 5 per account** — which is why the private-key backup below
matters.

⚠️ **BACK UP THE PRIVATE KEY IMMEDIATELY.** Keychain Access → My Certificates → right-click →
Export as `.p12`, stored securely. **Losing the private key kills the certificate** and regenerating
burns one of the five slots.

**Step 4 — notarization credentials (task 1.4).** Generate an **app-specific password** at
[account.apple.com](https://account.apple.com) → Sign-In and Security → App-Specific Passwords.
⚠️ **NOT the Apple ID password**, and ⚠️ **it must never land in the repo.** Store it as a keychain
profile:

```
xcrun notarytool store-credentials "claudesk-notary" \
  --apple-id "<apple-id>" --team-id "<TEAMID>" --password "<app-specific-password>"
```

**Tauri v2 wiring (pre-answers part of task 1.5).** Config keys are `bundle.macOS.signingIdentity`
/ `.entitlements` / `.hardenedRuntime`; `APPLE_SIGNING_IDENTITY` is the env-var alternative.
Notarization takes **either** the App Store Connect API path (`APPLE_API_ISSUER` / `APPLE_API_KEY` /
`APPLE_API_KEY_PATH`) **or** the Apple ID path (`APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`),
where `APPLE_PASSWORD` **must** be the app-specific password.
⚠️ **Whether Tauri applies hardened runtime automatically was NOT resolved by the doc pass (LOW
confidence) — task 1.6 must determine it empirically, not from the docs.**

**WP1 → WP2 rationale:** Enrollment has a hard **calendar latency** (24h published; 2–7+ weeks
reported in 2026) and an **operator-only**
step, and `bundle.macOS` is empty today so every config shape is unknown. Building the signing
pipeline before the cert exists would mean designing against assumed shapes; worse, task 1.6's
hardened-runtime/subprocess risk could invalidate the approach entirely. **Resolve the riskiest
unknown at its cheapest moment.**

---

### WP2: Sign + notarize the release pipeline, and delete the quarantine workaround
**Description:** Wire Developer-ID signing, notarization and stapling into the build/release path;
then **remove** the self-quarantine-clear mechanism that existed only because the app was unsigned.
**Milestone:** M14 (remainder)
**Dependencies:** **WP1 (hard gate — cert must exist and probe must report GO)**
**Size:** L
**Tasks:**
- [ ] 2.1 Add `bundle.macOS` signing config to `tauri.conf.json` + the entitlements file from probe
      task 1.6. ⚠️ **Check whether `tauri.dev.json`'s dev-identity overlay needs a matching change
      or an explicit opt-OUT** — dev builds should **not** require the cert, or `pnpm tauri:dev`
      breaks for anyone without it (including a contributor).
- [ ] 2.2 Produce a **signed, notarized, stapled** `.app` + `.dmg` locally. Verify with
      `codesign --verify --deep --strict --verbose=2`, `spctl -a -vvv -t install`, and
      `stapler validate`. ⚠️ **All three must pass** — `codesign` alone does not prove notarization.
- [ ] 2.3 ⚠️ **INSTALLED-BUILD SMOKE TEST — mandatory, and `pnpm tauri:dev` CANNOT substitute.**
      Launch the notarized `.app` **from Finder** and confirm: no Gatekeeper prompt, **no `xattr`
      step needed**, `cc_spawn` still finds `claude` (the hardened-runtime + GUI-PATH interaction),
      PTY works, Sublime launchers work. Per `docs/lessons/verify-self-tiers.md`, anything touching
      PATH/env/subprocess spawning **must** be verified from an installed bundle launched from
      Finder.
- [ ] 2.4 Update the `/release` skill's pipeline to sign + notarize + staple, including the
      credential mechanism from 1.4. ⚠️ **The skill is a symlink into the mccc repo** (see memory
      `installed-skills-are-symlinks-into-the-mccc-repo`) — **editing it dirties a DIFFERENT git
      repo.** Check that repo's `git status` and decide deliberately whether this is a Claudesk
      change or a cross-repo handoff.
- [ ] 2.5 **Delete the quarantine workaround.** Rust: `clear_own_quarantine`,
      `quarantine_clear_command`, `resolve_bundle_path`, `QUARANTINE_ATTR`, the two `UpdaterError`
      variants, and the `lib.rs:76` comment. Frontend: the `QUARANTINE_FALLBACK_ACTIVE` seam, the
      fallback dialog, and its wiring in `App.tsx` / `updateFlowState.ts` / `useUpdater.ts` + the
      two test files. ⚠️ **Do NOT split a deletion from its consumer migration** — the M13.5 WP3
      blank-app failure (`verify:auto` and `tsc` both green while `#root` was empty). **Run a boot
      smoke test in the same phase as the deletion.** ⚠️ **Sweep `invoke()` call sites** if any
      `#[tauri::command]` is removed (memory `tauri-command-removal-needs-invoke-sweep`) — the
      binding is stringly-typed and invisible to the unit gate.
- [ ] 2.6 ⚠️ **Rewrite the superseded architecture decisions** in `arch/build-update-release.md`:
      the "Unsigned + minisign, not notarized" bullet and the "M14 (Polish) overlap — reconciled"
      bullet. Record the reversal, its date, and that minisign is retained.
      ⚠️ **`doc-correction-scope-list-is-a-floor`: grep the retracted claim repo-wide first** —
      "unsigned", "not notarized", "xattr", "quarantine" — and fix every assertion site, not just
      the two named here. Separate string-matches from claim-assertions.
- [ ] 2.7 Verify an **existing `v0.5.0` install self-updates into the first signed build** without
      the trust anchor changing. ⚠️ **This is the migration case** — a stranded installed base is
      the one unrecoverable failure in this WP.
- [ ] 2.8 Update the Homebrew tap cask if notarization changes anything it asserts (e.g. a
      `--no-quarantine` note or a stanza that assumed an unsigned artifact).

**WP2 → WP3 rationale:** Signing is the only WP with an external calendar dependency and an
unrecoverable failure mode (a stranded installed base); it also **removes** content WP4's docs would
otherwise have to describe. Front-loading it means the setup docs are written **once**, against the
final install story — rather than written, then rewritten when the `xattr` step disappears.

---

### WP3: Hotkey configuration in the `⌘,` Settings panel ✅ SHIPPED 2026-09-17 (commit `5e3ecd9`)
> ✅ **SHIPPED 2026-09-17.** Resumed from its 2026-09-15 park, the 4 open verify-human leaves
> answered, then Phase 2 built and verified end-to-end. Commits: `3db5994` (registry) + `ef0bb82`
> (two omitted chords + the completeness guard) + `5e3ecd9` (the Settings render).
> ⚠️ **SHIPPED AS A READ-ONLY REFERENCE LIST, NOT A REBINDING UI** — the WP title says
> "configuration" and that is now misleading. Rebinding, persistence and reset-to-default were
> ruled out of scope at spec-open (operator-confirmed twice), so **task 3.4 is VOID** and 3.2/3.5
> shipped narrowed. See the per-task notes below; nothing is silently ticked.
**Description:** Let the user see and rebind Claudesk's keyboard shortcuts, as a new group in the
**existing** Settings panel.
**Milestone:** M14 (remainder)
**Dependencies:** none (parallel-safe with WP1/WP2)
**Size:** M
**Tasks:**
- [x] 3.1 Build the **hotkey registry** — one place naming every binding, its default chord, its
      scope, and whether it is rebindable. ⚠️ **11 `*Chord.ts` predicate modules already exist**
      (`settingsChord`, `workspaceSwitchChord`, `newWorkspaceChord`, `newTerminalChord`,
      `closeTerminalChord`, `dashboardChord`, `searchChord`, `finderChord`, `newFileChord`,
      `tabSwitchChord`, `closeTabChord`) sharing a `chordEvent.ts` type. **This WP centralizes what
      exists; it does not write keyboard handling from scratch.**
      ⚠️ **Enumerating the registry as data proves the SET, not that each entry has a CALLER** —
      the M12 dead-`/exit` / M13-registry trap, flagged twice in `CLAUDE.md`. **Funnel every chord
      read through ONE function and guard THAT**, and assert each registry entry is reachable from
      a real handler.
- [x] 3.2 Encode the **collision model** — ⚠️ **shipped DESCRIPTIVE, not enforced** (rebinding is
      out of scope, so there is nothing to enforce against; the reserved range and the free chord
      are registry METADATA). Enforcement would have been an unreachable guard. ⚠️ **`⌘⇧`+digit is RESERVED for workspace/filmstrip
      switching** (memory `cmd-shift-digit-reserved-for-filmstrip`) — it is a *range*, not one
      binding, and must be unassignable. ⚠️ **`⌘⇧O` is FREE** (the in-app Sublime hotkey was deleted
      as redundant with the button). `⌘⇧E` is the Sublime Text pop. Reserve the macOS system chords
      the app must not shadow.
- [x] 3.3 Add the Settings group. ⚠️ **EXTEND the M10.9 WP2 panel** — match its existing four
      labelled groups' idiom; do not rebuild the panel.
      ⚠️ **[PRIOR: `explicit-selectable-mode-over-inferred-mode`] leaning LOW-SURFACE — flag if
      wrong.** Ship **a legible read-only list of every binding + a per-binding reset-to-default**,
      and **rebinding only where it is cheap and safe**. ⚠️ **Explicitly NOT in v1:** free-form
      record-any-chord capture, per-workspace binding scopes, or a conflict-resolution UI. Rationale:
      the prior's risk-surface-vs-value rule — the operator's own bindings already work, so the
      value here is friend-facing and unproven, while the rich version drags in capture-mode,
      normalization, and conflict-UI bug surface. **Prove the value first; escalate on real demand.**
- [~] 3.4 **VOID for v1 — NOT SHIPPED, and deliberately so.** Persist overrides in `settings.json` via the existing `config_store` seam.
      ⚠️ **A malformed chord string must not take the settings file down** — the picker-row
      drive-mode precedent (`arch/session-resumption.md`) chose a closed `<select>` for exactly this
      reason. **Validate on read and fall back to the default binding**, never propagate a parse
      error.
- [x] 3.5 Tests: registry↔handler reachability (3.1) — ⚠️ **shipped BIDIRECTIONAL: a second
      code→registry completeness guard was added at the verify-self back-loop after it found two
      chords the registry omitted.** Reserved-range enforcement (3.2) and malformed-persistence
      fallback (3.4) are **N/A** — both depend on rebinding/persistence, which v1 does not have. ⚠️ **Mutation-prove each guard INDIVIDUALLY and confirm
      each mutant landed in executable code** (`docs/lessons/source-text-guards.md`) — an invalid
      probe and a real hole look identical.

---

### WP4: Two-tier setup documentation
**Description:** The full two-tier setup-doc buildout — the workflow-independent lite-IDE core, and
the opt-in gated workflow layer — completing the deliverable the 2026-09-06 correctness pass left
partial.
**Milestone:** M14 (remainder)
**Dependencies:** **WP2** (the install story must be final before it is documented)
**Size:** M
**Tasks:**
- [ ] 4.1 Write **tier 1 — the lite-IDE core**: picker, workspaces, PTY terminal, editor/diff,
      file tree, search, hook-driven status surfaces, PiP, menu-bar alarm, time analytics. ⚠️ **This
      tier must read as complete on its own** — a stranger who never installs the workflow system is
      a first-class user, not a degraded one.
- [ ] 4.2 Write **tier 2 — the opt-in workflow layer**: what `workflow_features_enabled` turns on,
      how to enable it, and a pointer to the companion workflow system.
      ⚠️ **[PRIOR: `gate-substrate-dependent-feature-class-behind-default-off-opt-in`] — document
      the gate as a first-class concept**, including that OFF is byte-identical and that enabling
      the UI is **strictly separate** from installing the substrate.
      ⚠️ **Correct the stale "default CLI args for `claude`" claim here and in `roadmap.md`** —
      **PiP shipped M5**, **permission-mode shipped M6**, and the per-project `--model` override
      shipped **M11.5 on the picker row, not in Settings**.
- [ ] 4.3 ⚠️ **Remove every `xattr -dr com.apple.quarantine` instruction** — **six known README
      sites** (lines ~73, 83–86, 93, 307, 319, 325) plus the line at ~332 that forward-references
      this milestone as *"still deferred to a later polish milestone."* ⚠️ **Gated on WP2 actually
      landing** — if signing slips, these stay and tier-1 documents the Gatekeeper step instead.
      ⚠️ **Grep, don't trust this list: it is a FLOOR, not the scope.**
- [ ] 4.4 Verify every setup instruction by **following it literally** from a clean state. ⚠️ **Dead
      links and stale commands are what the 2026-09-06 pass already had to fix once** — re-check,
      don't assume.

**WP3 ∥ WP4 note:** WP3 and WP4 are **independent** and may run in either order or in parallel.
WP4's *dependency is on WP2*, not on WP3 — hotkeys are a Settings feature the docs mention in
passing, not a prerequisite for them. If WP3's hotkey group ships first, WP4 documents it; if not,
WP4 does not wait.

---

### WP5: Repo description + topics ✅ COMPLETE 2026-09-15
**Description:** Set the GitHub repo's description and topic tags for discoverability.
**Milestone:** M14 (remainder)
**Dependencies:** none
**Size:** XS
**Tasks:**
- [x] 5.1 ✅ **DONE 2026-09-15.** Description set to the README tagline + scope: *"Many Claude Code
      projects. One window. Zero hunting. A lean, dark, macOS-native lite IDE for the power Claude
      Code user."* — reuses the existing README h3 verbatim so the repo page and README agree rather
      than inventing a second positioning statement. **10 topics** applied: `claude-code`, `claude`,
      `anthropic`, `macos`, `tauri`, `rust`, `typescript`, `react`, `developer-tools`, `ide`.
      Verified via `gh repo view --json description,repositoryTopics`.
- [x] 5.2 ✅ **DONE 2026-09-15.** Both the description framing and the topic set were confirmed with
      the operator before writing, per the outward-facing rule.

⚠️ **Noted, NOT done — `homepageUrl` is empty.** Out of WP5's scope as written (description +
topics only), so it was deliberately left rather than silently widened. Candidates if wanted: the
GitHub Releases page or the Homebrew tap. **Decide at WP4** (setup docs), where the install story
is being written anyway.

---

## Dependency map

```
WP0 (supervisor hotfix)  🔥 URGENT — preempts everything; operator dogfeedback

WP1 (probe: enroll + cert + toolchain)  ⚠️ OPERATOR-GATED — ✅ ENROLLMENT APPROVED 2026-09-15
 └─> WP2 (sign + notarize + delete quarantine workaround)   [CRITICAL PATH]
      └─> WP4 (two-tier setup docs)

WP3 (hotkeys in Settings)     ── parallel track, no dependencies
WP5 (repo description/topics) ── parallel track, no dependencies
```

**Critical path:** WP1 → WP2 → WP4. ⚠️ **Its first link is calendar-bound, not effort-bound** —
Apple's approval is 24h published but reportedly 2–7+ weeks in 2026, and no amount of agent work shortens it.

**Parallel tracks:** WP3 and WP5 have **no dependency on the signing chain** and are the right work
to run while enrollment is pending. ⚠️ **Start task 1.1 (enrollment) FIRST regardless of what is
built next** — it is the long pole, and it is the one task an agent cannot perform.

**Suggested execution order — ⚠️ REVISED 2026-09-15 by operator:** **WP0** (supervisor hotfix,
urgent) → **task 1.2** (operator creates the Developer ID cert; enrollment already approved) →
**WP1** completes → **WP2** (sign + notarize) → **WP4** (setup docs). **WP3 is PARKED**
mid-verify-human and resumes after the release. **WP5 is DONE.**
⚠️ **The original ordering assumed enrollment was the long pole and WP3/WP5 were the parallel
filler. Both premises expired the same day:** enrollment was approved in hours, and WP3 was parked
by the operator. Do not restore the old order by citing the parallel-track rationale.

## Milestone exit criteria (from `roadmap.md`, unchanged)

A stranger who does **NOT** run the workflow system can install Claudesk and use the lite-IDE core
with a clean, coherent UX (gate off → no dead affordances) and discover the workflow system via the
one-time invite. A stranger who **DOES** run it enables the gate once and gets the full
workflow-aware tool.

⚠️ **R-1 raises the bar on the first half:** with signing landed, "can install" must mean **no
Gatekeeper prompt and no terminal command** — not "can install after running `xattr`."

## Architectural gaps

**None blocking.** The signing work changes `arch/build-update-release.md`'s recorded decision, but
that is a **decision reversal to be written down (task 2.6)**, not an unanswered architectural
question — the arch doc already anticipated this exact reversal and named M14 as its home. No
`/product-arch` back-loop is needed.

⚠️ **One risk is flagged as a probe task rather than an arch gap** (WP1 task 1.6): hardened runtime
is mandatory for notarization and could break subprocess spawning or the PTY. If the probe finds it
does, **that is a NO-GO that returns here**, not something WP2 works around silently.
