---
stage: wbs
state: in-progress
milestone: M14 (remainder)
created: 2026-09-15
updated: 2026-09-15
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

### WP1: Probe — Apple Developer enrollment, cert issuance, and the notarization toolchain
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
- [ ] 1.1 ⚠️ **OPERATOR TASK — an agent cannot do this.** Enroll in the Apple Developer Program
      ($99/yr). **Blocks everything in WP2.** Surface the approval latency to the operator at the
      start, not when WP2 stalls. ⚠️ **24h is Apple's published line; 2026 reports describe 2–7+
      weeks.** See the operator runbook below.
- [ ] 1.2 ⚠️ **OPERATOR TASK.** Create a Developer ID Application certificate (CSR via Keychain
      Access → developer.apple.com → download → install to login keychain). ⚠️ **Developer ID
      Application is the correct type** — *not* "Mac App Distribution" (App Store only) and *not*
      "Developer ID Installer" (`.pkg` only). The wrong cert type signs but fails notarization.
- [ ] 1.3 Verify the identity is visible to the toolchain: `security find-identity -v -p
      codesigning` must list exactly one `Developer ID Application: …` entry; record its hash.
- [ ] 1.4 Document the `notarytool` credential path. ⚠️ **Prefer an app-specific password +
      `notarytool store-credentials` keychain profile** over inlining an Apple ID password anywhere.
      ⚠️ **No credential may land in the repo** — record the mechanism, never the secret.
- [ ] 1.5 Determine the exact `tauri.conf.json` `bundle.macOS` keys Tauri 2.9 requires
      (`signingIdentity`, `entitlements`, `hardenedRuntime` posture) and which env vars the Tauri
      CLI reads (`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).
      ⚠️ **Read Tauri's own docs for the installed 2.9.x line** — do not carry a v1 recipe over.
- [ ] 1.6 Determine the entitlements the app actually needs. ⚠️ **Hardened runtime is mandatory for
      notarization and it BREAKS THINGS** — Claudesk spawns subprocesses (`claude`, `subl`,
      `smerge`, login shell for PATH capture) and runs a PTY. Identify whether
      `com.apple.security.cs.allow-unsigned-executable-memory`,
      `…disable-library-validation`, or `…allow-jit` are required. ⚠️ **This is the highest
      technical risk in the milestone** — a hardened-runtime regression that kills `cc_spawn` would
      be invisible in `pnpm tauri:dev` and only appear in an installed build.
- [ ] 1.7 Confirm notarization does **not** invalidate the minisign updater flow: the `.app.tar.gz`
      is signed by minisign *after* the `.app` is built, so a notarized+stapled `.app` produces a
      different tarball but the **trust anchor `774E2E8429FDF78A` is unchanged**. ⚠️ **Reason it
      through against the shipped `v0.5.0` path and write the conclusion down** — an existing
      install self-updating into the first signed build is the migration case that must not break.
- [ ] 1.8 Write the probe report: GO/NO-GO, the exact pipeline shape, the entitlements set, and any
      surprise. ⚠️ **If 1.6 finds hardened runtime breaks subprocess spawning, that is a NO-GO
      pending resolution — report it, do not proceed to WP2 anyway.**

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

### WP3: Hotkey configuration in the `⌘,` Settings panel
**Description:** Let the user see and rebind Claudesk's keyboard shortcuts, as a new group in the
**existing** Settings panel.
**Milestone:** M14 (remainder)
**Dependencies:** none (parallel-safe with WP1/WP2)
**Size:** M
**Tasks:**
- [ ] 3.1 Build the **hotkey registry** — one place naming every binding, its default chord, its
      scope, and whether it is rebindable. ⚠️ **11 `*Chord.ts` predicate modules already exist**
      (`settingsChord`, `workspaceSwitchChord`, `newWorkspaceChord`, `newTerminalChord`,
      `closeTerminalChord`, `dashboardChord`, `searchChord`, `finderChord`, `newFileChord`,
      `tabSwitchChord`, `closeTabChord`) sharing a `chordEvent.ts` type. **This WP centralizes what
      exists; it does not write keyboard handling from scratch.**
      ⚠️ **Enumerating the registry as data proves the SET, not that each entry has a CALLER** —
      the M12 dead-`/exit` / M13-registry trap, flagged twice in `CLAUDE.md`. **Funnel every chord
      read through ONE function and guard THAT**, and assert each registry entry is reachable from
      a real handler.
- [ ] 3.2 Encode the **collision model**. ⚠️ **`⌘⇧`+digit is RESERVED for workspace/filmstrip
      switching** (memory `cmd-shift-digit-reserved-for-filmstrip`) — it is a *range*, not one
      binding, and must be unassignable. ⚠️ **`⌘⇧O` is FREE** (the in-app Sublime hotkey was deleted
      as redundant with the button). `⌘⇧E` is the Sublime Text pop. Reserve the macOS system chords
      the app must not shadow.
- [ ] 3.3 Add the Settings group. ⚠️ **EXTEND the M10.9 WP2 panel** — match its existing four
      labelled groups' idiom; do not rebuild the panel.
      ⚠️ **[PRIOR: `explicit-selectable-mode-over-inferred-mode`] leaning LOW-SURFACE — flag if
      wrong.** Ship **a legible read-only list of every binding + a per-binding reset-to-default**,
      and **rebinding only where it is cheap and safe**. ⚠️ **Explicitly NOT in v1:** free-form
      record-any-chord capture, per-workspace binding scopes, or a conflict-resolution UI. Rationale:
      the prior's risk-surface-vs-value rule — the operator's own bindings already work, so the
      value here is friend-facing and unproven, while the rich version drags in capture-mode,
      normalization, and conflict-UI bug surface. **Prove the value first; escalate on real demand.**
- [ ] 3.4 Persist overrides in `settings.json` via the existing `config_store` seam.
      ⚠️ **A malformed chord string must not take the settings file down** — the picker-row
      drive-mode precedent (`arch/session-resumption.md`) chose a closed `<select>` for exactly this
      reason. **Validate on read and fall back to the default binding**, never propagate a parse
      error.
- [ ] 3.5 Tests: registry↔handler reachability (3.1), reserved-range enforcement (3.2), and
      malformed-persistence fallback (3.4). ⚠️ **Mutation-prove each guard INDIVIDUALLY and confirm
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

### WP5: Repo description + topics
**Description:** Set the GitHub repo's description and topic tags for discoverability.
**Milestone:** M14 (remainder)
**Dependencies:** none
**Size:** XS
**Tasks:**
- [ ] 5.1 Set description + topics via `gh repo edit`. ⚠️ **Sized XS deliberately — do not inflate
      this into a marketing-copy work package.** The description should match the README's existing
      one-line framing rather than invent a new positioning statement.
- [ ] 5.2 ⚠️ **Confirm with the operator before writing** — repo metadata is **outward-facing and
      public**, and the description is the first thing a stranger reads. One line, not a paragraph.

---

## Dependency map

```
WP1 (probe: enroll + cert + toolchain)  ⚠️ OPERATOR-GATED, 24h published / 2-7+ wks reported
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

**Suggested execution order:** kick off **1.1/1.2** (operator) → build **WP3** and **WP5** while
approval is pending → **WP1** completes → **WP2** → **WP4**.

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
