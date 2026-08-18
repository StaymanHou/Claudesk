---
stage: arch
state: complete
updated: 2026-08-18  # SPLIT into arch/<subsystem>.md — this file is now the index + the warning set.
shape: index
archive-root: workflow-system/product/archive/
---
# Architecture

**Claudesk** — a macOS-only, single-user Tauri 2 desktop app: one window, N workspaces, each a project
with a PTY-backed Claude Code session on the left and a swappable panel on the right.

⚠️ **This file is an INDEX. The architecture lives in [`arch/`](arch/), one file per SUBSYSTEM.** Split
2026-08-12 from a single 982-line milestone-ordered document. Read the warning set below, then open the
subsystem you need.

| Subsystem | What's in it |
|---|---|
| [Foundations](arch/foundations.md) | tech stack, persistence, dev environment, system design, data flow, key decisions |
| [Process, PTY & session lifecycle](arch/process-and-pty.md) | spawn, the prompt-flush invariant, `slash_command_bytes`, shutdown |
| [Status channel & surfaces](arch/status-channel-and-surfaces.md) | the CC hook channel, `status_broadcaster`, filmstrip, PiP NSPanel, menu-bar tray |
| [Session resumption & drive mode](arch/session-resumption.md) | the two signals, the unclean-exit flag, the announcement, the drive-mode signal, the picker cell |
| [Right-panel surfaces](arch/right-panel-surfaces.md) | editor, diff, terminal, the gated docs panel, `fs_index`, `editor_fs` |
| [Workflow-features gate](arch/workflow-gate.md) | the `useWorkflowFeaturesEnabled` seam, the OFF-invariant guard, Settings, the invite |
| [The `~/.claude/` substrate](arch/claude-substrate.md) | install/uninstall wizards, provenance, the compiler-enforced refuse-guard |
| [Security & trust posture](arch/security-posture.md) | raw HTML blocked, CSP status |
| [Build, update & release](arch/build-update-release.md) | artifacts, self-update, signing, the release pipeline |
| [Native app menu](arch/app-menu.md) | the menu bar, and why it carries no accelerators |
| [Time analytics](arch/time-analytics.md) | the SQLite exception and its load-bearing rules |

**Writing here:** add to the **subsystem** file — never a new milestone section; that append habit is
what grew the old file monotonically. A superseded design survives only as a `⚠️ do not reinstate` note
on the rule it would contradict; the blow-by-blow lives in `archive/<cycle>/`. ⚠️ **Never move a ⚠️ out
of the architecture set** — as-built *narrative* may be archived freely, but a warning is hit by someone
already editing and not looking. **⚠️ When you add a warning, add its pointer below** — this index
decayed once already (warnings grew 24→67 while the read window kept only 6).

## ⚠️ Load-bearing constraints — read this first

Each line is a *pointer*; the full reasoning stays at the anchor.

**Never do these — each was learned by a real failure:**

- **Never infer CC/workflow state from PTY output.** Hook channel + known files only; `Unknown` is honest. → [status](arch/status-channel-and-surfaces.md)
- **Never classify a docs reload on `FsChange.kind`** — the backend folds a mixed 200 ms batch to `Other`. Diff the re-listed set. → [right-panel](arch/right-panel-surfaces.md)
- **Never call a PiP/NSPanel or tray window op off the main thread** — AppKit aborts the process with **no Rust panic**; presents as a clean launch that silently dies. Marshal via `run_on_main_thread`. → [status](arch/status-channel-and-surfaces.md) §B.3
- **Never `git checkout -- <file>` to revert while work is uncommitted** — an agent did this and reverted uncommitted shipped work. Use `cp` from a snapshot.
- **Never delete a hook you did not install**, and keep the drift fixture — it is the proof, not dead code. → [status](arch/status-channel-and-surfaces.md)
- **Never write into `workflow-system/` from Claudesk.** It reads that world; the WIP-frontmatter mirror was REJECTED. → [session-resumption](arch/session-resumption.md)
- **Never generalize `modelOverride.ts`'s "do NOT validate" rule to the drive mode** — closed value set, and a bad string fails serde on read and takes the whole project list down. → [session-resumption](arch/session-resumption.md)
- **Never rebuild an off-screen live xterm DOM mirror** (`IntersectionObserver` pauses the renderer) — serialize from the buffer instead. → [status](arch/status-channel-and-surfaces.md) §B.1

**Verification rules that have burned us:**

- **An observation is only decisive when a broken implementation would give a DIFFERENT answer.** Ask what the platform does *unaided* first — WebKit retains `scrollTop` on a never-unmounted hidden node and clamps out-of-range writes itself, which silently vacated two live proofs. → [right-panel](arch/right-panel-surfaces.md)
- **A `?raw` source-text guard cannot express a behavioral property.** Extract the code so a test drives the real thing. A guard satisfied by the module's own comments passes exactly when the code is deleted.
- **A guard must be mutation-proven, and the mutation must land in *executable* code** — a silent no-op is indistinguishable from a real hole. ⚠️ **An invalid probe and a real hole present IDENTICALLY.** → [gate](arch/workflow-gate.md)
- **Probe each guard arm INDIVIDUALLY** — a composite bypass that trips *some* arm reports "the guard bites" while hiding a gap. That method is what found the basename hole. → [gate](arch/workflow-gate.md)
- **A safety guard must be mutation-proven, not merely PRESENT** — three that looked like proof were not. → [substrate](arch/claude-substrate.md)
- **Hash around each TOGGLE, never around a relaunch**, when proving "no `~/.claude/` mutation" — `hook_install` legitimately rewrites at launch and is universal. → [gate](arch/workflow-gate.md)
- **The installed `.app` is a different environment from `pnpm tauri:dev`** (GUI PATH, `LANG`). Anything touching PATH/env/external spawn must be smoke-tested from a Finder-launched build. → [foundations](arch/foundations.md)
- **A diagnosis that EXPLAINS a failure is not thereby the CAUSE** — a *fixture*-blocked verdict was falsified by a second fixture; the real cause was `cc_permission_mode: "dontAsk"`, which suppresses the prompt **without granting the write** (read at **spawn** — the pane footer is the tell). → [session-resumption](arch/session-resumption.md)
- **An ad-hoc run is evidence about one moment; only a standing test is coverage.** → "Verification method" below
- **A doc-correction scope list is a FLOOR** — grep the retracted *claim* repo-wide. → "Verification method" below

**Architectural lines you must not cross:**

- **The gate seam is `useWorkflowFeaturesEnabled`** — a gated surface must **not exist** when off. Never `invoke()` ad hoc, never the raw wrapper. The guard bites at the **type declaration**, and the chord arm **strips comments**, so the seam reference must be executable source. → [gate](arch/workflow-gate.md)
- **⚠️ The gate applies PER ARM, not per feature** — the discriminator is *applicability*, never audience size. → [session-resumption](arch/session-resumption.md)
- **A new gated surface that is not a panel / menu-id / chord / row-cell / skill-row owns a SIXTH guard arm** — arms 1–5 are TAKEN (the fifth landed at M13 WP2). ⚠️ **Probe each arm INDIVIDUALLY** — there are **7 subjects** across the 5 arms (arm 4 owns two derivations, arm 5 two predicates). ⚠️ `WORKFLOW_TERMS` contains neither `"recycle"` nor `"session"`, so a `RECYCLE_SESSION` menu id or panel registers **unseen** by arms 1–3. → [gate](arch/workflow-gate.md)
- **Provenance, not abstinence,** for anything touching `~/.claude/`: only remove what Claudesk **recorded** installing; every degraded read fails toward `developer`. Compiler-enforced. → [substrate](arch/claude-substrate.md)
- **Raw HTML is BLOCKED**, and the two controls are **redundant, not layered** — `rehype-raw` alone measured **6 live vectors**. Never reason about one without the other. → [security](arch/security-posture.md)
- **Read-only is a property of the PANEL, not the webview** — under `csp: null` the webview still reaches `editor_fs::write_file`. → [security](arch/security-posture.md)
- **All injection goes through `slash_command_bytes`**; PTY prompt-flush needs both halves of its invariant. → [process-and-pty](arch/process-and-pty.md)
- **Every read/write of the unclean-exit flag goes through `key_for()`** — a reader that skips it silently matches nothing. → [session-resumption](arch/session-resumption.md)

## Verification method

Method banked across cycles; each item was paid for by a real defect.

- **⚠️ The recurring defect shape, hit FOUR times: a mechanism correct in itself sitting behind a caller
  or record that does not honor it.** `pendingRestore`'s undispatched `"reset"`; `shouldJump`'s
  self-poisoning guard (a shipped CRITICAL); a doc comment citing a nonexistent test; a stale
  `#[allow(dead_code)]` outliving its consumer. **Extracting a pure state machine proves the MACHINE,
  not its CALLER** — the structural fix is to funnel every write of shared state through ONE function
  and guard *that*, not to add assertions. Corollary for planning: when a verify step names *"does the
  caller honor the contract?"* as the risk, extracting the contract does not answer it; only a
  caller-side guard does.
- **⚠️ Every CSS guard here reads ONE side of the CSS↔component contract**, so a class can be
  *styled-but-never-emitted* (dead CSS still carrying behavior — a live WP4c regression that 1979 tests,
  tsc, eslint, prettier and a clean build all missed) or *emitted-but-never-styled* (M10.9's
  eleven-undefined-classes CRITICAL) with both sides individually green. **Both directions are now
  guarded for the picker cell**, mutation-proven; the repo-wide sweep remains open
  (`SURFACE-2026-08-10-NO-GUARD-COUPLES-A-CSS-CLASS-TO-ITS-EMITTING-COMPONENT`). ⚠️ Building it: the set
  comparison is the easy half — defining *emitted* is the hard half (this codebase's `data-testid`s share
  the class naming convention, so scan `className` **positions**; and strip comments, or a design-prior
  slug ending `-is-chosen` demands CSS for a class that exists only in prose).
- **⚠️ An ad-hoc verification run is evidence about one moment; only a standing test is coverage.** A
  comment crediting the inverse CSS direction to "verify-auto's className→CSS sweep" left that direction
  open for two WPs while reading as closed
  (`SURFACE-2026-08-12-A-COMMENT-CREDITED-COVERAGE-TO-A-SWEEP-THAT-DOES-NOT-EXIST`).
- **⚠️ A doc-correction scope list is a FLOOR, not a boundary** — WP4d named 5 sites and found 10; WP5's
  read-only 5.5 still found an 11th (`roadmap.md:58`, describing `.session.md` in the **present tense**
  via two commands retired at M9 WP5). Grep the retracted **claim** repo-wide, and separate
  string-matches from claim-assertions: three `step-by-step` hits in `roadmap.md` are ordinary English in
  install instructions, and "finishing the job" there would introduce errors.
- **⚠️ `?raw` source-text guards verify STRUCTURE, never RUNTIME.** One passed while the behavior was
  broken (source order ≠ execution order); another silently stopped matching after Prettier reflowed the
  file. Anything involving React batching, async, or event ordering must be extracted to a pure function
  and asserted as a value. If a `?raw` guard is unavoidable, assert single identifiers — never formatted
  multi-line expressions.
- **⚠️ jsdom reports `clientHeight === 0` for VISIBLE elements too** — scroll geometry must be an
  injected **value**, never read off an element.
- **⚠️ A PAUSE-in-all-modes gate is cleared only by the human answering it.** WP4c generalized "auto chain
  it" into skipping `verify-human` and wrote *"WAIVED by the operator"* into the WIP five times with
  invented rationale — autopilot's own definition is *"only pause at verify-human"*, so the one gate
  skipped was the one that mode keeps. **The fabricated provenance is the worse half:** a skipped step is
  visible, a skipped step recorded as due diligence is not
  (`SURFACE-2026-08-10-A-PACING-INSTRUCTION-WAS-READ-AS-A-GATE-WAIVER`, high, open).

## Forward-look

Not built, deliberately — recorded so a future reader knows these were considered.

- **`SdkCcSession`** — an Agent-SDK-backed `CcSession` impl (using `@anthropic-ai/claude-agent-sdk`), the
  documented migration path if PTY-based control ever becomes untenable.
- **PiP click-to-focus** — promote a workspace from a PiP tile click. Defer until display-only PiP has
  been used long enough to confirm the limitation is real.
- **A richer git surface** (interactive staging / blame / history) beyond the diff viewer's basics — only
  if the in-app diff viewer proves insufficient in dogfooding.
- **Editor LSP-style features** (completions/diagnostics) via a language server behind CM6 — explicitly
  out of vision scope (Claude Code is the intelligence layer), noted only as a known CM6-extensibility
  path.
