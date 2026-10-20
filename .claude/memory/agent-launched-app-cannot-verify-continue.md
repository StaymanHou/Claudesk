---
name: agent-launched-app-cannot-verify-continue
description: An agent-launched Claudesk spawns CC with no transcript and no hook events UNLESS `pnpm tauri:dev` itself runs with the full Claude-marker `env -u` strip (then both work, verified 2026-09-28); stripping at a child call does not help.
metadata:
  type: project
---

⚠️ **CORRECTED 2026-09-28 — the fix is to strip at the app PARENT, and it works.** Launch the dev build
itself with every Claude session marker removed:

```
env -u CLAUDE_CODE_CHILD_SESSION -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_ENTRYPOINT \
    -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_PID \
    -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_EXECPATH -u CLAUDE_EFFORT -u CLAUDESK_DRIVE_MODE \
    pnpm tauri:dev
```

The app-spawned CC then **writes a transcript** (verified 2026-09-28: scratch-c's newest `.jsonl` held the
agent-injected prompt) and **emits real hook events** (`UserPromptSubmit`/`Stop` in `status-channel.log`,
first seen 2026-09-25). An agent can drive REAL turns with
`__TAURI_INTERNALS__.invoke('cc_input', {sessionId, data: btoa("…")})` via `webview_execute_js`
(fire-and-forget; the PTY session id is the fiber prop `ccSessionId`, e.g. `cc-5`).
⚠️ **CORRECTED 2026-10-20 (M16.5 WP1):** send the text and the submitting `\r` as **two separate
writes** (e.g. `\r` ~700 ms later). A long message with its `\r` in the SAME write arrives as one
burst, CC treats it as a paste, and the `\r` becomes a **newline in the input box** — the prompt sits
unsubmitted. Short slash commands survive a single write, which is why `slashCommandPayload` works.
Also **never `await`** the invoke inside `webview_execute_js`: the bridge reported "Script execution
timeout" while the bytes had in fact landed; call it fire-and-forget and record `.then` into a
`window.__…` var if you need the result. ⚠️ The pane's DOM/screenshot can lag the real state — the
workspace header's status text ("Working in background") or the dev `status-channel.log` is the
reliable tell that a turn actually started. So the
"operator-only" limit below applied to a launch that stripped only `CLAUDE_CODE_CHILD_SESSION`, or
stripped at a child call. ⚠️ **Still unverified:** that `--continue` now resumes the intended
conversation from such a build. It probably can, but assert transcript saving is ON first. The history
below is kept for the reasoning; its "cannot" is the pre-correction state.


A `--continue` verification **cannot be completed from a Claudesk that the agent launched.** Any CC
session spawned by such an app inherits **`CLAUDE_CODE_CHILD_SESSION`** down the launch chain
(this CC session → Bash tool → `pnpm tauri:dev` → node → Claudesk → `claude`), and that marker
**disables transcript saving** — the terminal shows `⚠ Transcript saving is off — inherited
CLAUDE_CODE_CHILD_SESSION marker`. Since `--continue` resumes from CC's **transcript store**, a session
spawned through the agent's app leaves nothing for a later `--continue` to land on.

**⚠️ The non-obvious part: `env -u CLAUDE_CODE_CHILD_SESSION` at the SEEDING call does not fix this.**
Seeding a fresh conversation with `env -u … claude -p "…"` **outside** the app works — that transcript
IS written, and is verifiably the newest `.jsonl` in `~/.claude/projects/<slug>/`. But the marker still
reaches the *app* through its own launch chain, so the in-app `--continue` resolved to an **older**
transcript (an `/exit` residue) rather than the fresh seed. Stripping the variable from one child does
not clean the parent that will spawn the session under test.

**What an agent CAN still prove** (all verified live 2026-08-05, M12 WP3):
- the flag reaches argv — `claude --permission-mode dontAsk --continue` observed on the spawned process;
- the arm is *selected* correctly — a no-fire (`⊘`) open spawns the same argv **without** `--continue`,
  side by side in one app, which is what proves an intent crossed the IPC boundary;
- that CC resumes *a* prior conversation (replayed history appears in the buffer).

**What only the operator can prove:** that it resumes the **intended** (newest/real) conversation.
That needs an operator-launched build (`pnpm tauri:dev` typed by them, or the installed `.app`), which
carries no marker.

⚠️ **Before spending a live run on any agent-driven `--continue` check, first assert transcript saving
is ON in the app-spawned session** — otherwise the check is vacuous in the
`[[verify-the-mutation-landed]]` / decisive-observation sense: a correct implementation and a broken one
both resume "some older conversation," so the run cannot distinguish them. Related:
[[verify-self-dev-vs-prod-process-name-collision]] (agent-launched vs operator-launched divergence),
[[mcp-bridge-tools-not-exposed-to-subagents]].

Tracked as `SURFACE-2026-08-05-CONTINUE-LANDS-ON-INTENDED-CONVERSATION-UNVERIFIED` (low — arm 1's
wiring is proven; the failure mode would be benign), carried to the next `/release` gate per
[[installed-build-verify-deferred-to-release]].
