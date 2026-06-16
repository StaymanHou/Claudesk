---
name: Never activate/launch/quit Sublime Text during development without explicit consent
description: Dev-time rule only — macOS Spaces yanks live ST windows to current Desktop; the Claudesk app's runtime ST activation is NOT constrained
type: feedback
---

Never run `osascript -e 'tell application "Sublime Text" to (activate|quit)'`, `open -a "Sublime Text"`, `subl …`, or any other command that activates or relaunches Sublime Text **during development** (agent-driven probes, tests, scripts, verify-self checks, debugging sessions, etc.) without first asking the user's permission. Same applies to anything that quits ST.

**Scope — load-bearing distinction:**

This rule applies to **development-time only** — work I (the agent) do during a session: probes, tests, dev-server smoke checks, debugging scripts, measurement instruments, ad-hoc Bash invocations. It does **NOT** apply to the **Claudesk application's runtime behavior**. The Claudesk app, once built and running for the user, freely launches/activates/raises Sublime Text — that is the app's core feature (WP8 hotkey-pop is the whole product reason this rule's parent project exists). When writing Claudesk source code that calls `subl <project-dir>` from a Rust handler, that is the app doing its job, not me running a probe.

**Apps in/out of scope:**
- **Sublime Text — in scope** (rule applies, dev-time). The user keeps live ST windows distributed across multiple macOS Spaces.
- **Sublime Merge — exempt.** No live-window-distributed-across-Spaces pattern; probe SM freely without asking.
- **Other apps (Chrome, Terminal, iTerm, etc.) — not covered by this rule.** They may be covered by the more general `feedback_osascript_activate_side_effects.md` though — read both rules together when a question arises for an app I haven't probed before.

**Why:** On 2026-06-16 during the WP3 Sublime CLI probe, repeated `osascript activate`/`quit` cycles on ST pulled all of the user's real Sublime Text windows onto the active Mission Control Space (Desktop 2). macOS gathers an app's windows onto the current Space when the app is activated there, so each focus-theft measurement was a destructive Space-assignment operation, not a harmless read. Recovery required manually dragging windows back in Mission Control. The probe data was good but the cost was a workflow disruption to the user's live work.

**How to apply (dev-time):**
- Before doing anything that would launch, activate, raise, or quit Sublime Text from a dev-time command — **stop and ask first**, explaining what you're about to do and why.
- If the user agrees, prefer the least-disruptive variant: `subl -b/--background` over plain `subl`; never `osascript … activate` for measurement purposes.
- For *measurement* (e.g., "is ST frontmost?"), prefer read-only inspection: `lsappinfo info -only pid <pid>`, `pgrep -fl sublime_text`, or `osascript -e 'tell application "System Events" to name of first process whose frontmost is true'` (querying System Events does NOT activate ST). Never use ST itself as the source of truth via AppleScript-to-ST.
- If a workflow genuinely needs to start/stop ST (e.g., WP8 hotkey integration *testing* in some future phase), get explicit per-session consent and offer to do it on a fresh test user account if available.

**How to apply (app-runtime — what's NOT constrained):**
- Writing Rust code in `src-tauri/` that calls `subl <dir>` / `smerge <dir>` for the WP8 hotkey-pop feature is the app doing its job — no consent needed at write time.
- Running the built app (`pnpm tauri dev` or the packaged binary) and watching it launch Sublime when the user presses the hotkey is the product working correctly — no consent needed at runtime.
- The distinction is: **agent does the action** = dev-time, ask first. **App (running in front of user) does the action** = runtime, no agent action involved, rule doesn't apply.
