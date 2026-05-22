---
stage: vision
state: complete
updated: 2026-05-22
---

> Revision 2026-05-22: Refined the "thin orchestration layer" auto-resume rule from a two-branch heuristic into a three-branch decision tree (Smart auto-resume on project open) and added a drive-mode selector UI to Phase 2. Added a 5th success metric covering both. Revised principles #2 and #4 to reflect the additions. No Phase 1 scope affected; both additions are Phase 2.

# Vision — Stayman CC Wrapper

## Vision

**The problem.** Starting work on any given project takes minutes of repetitive setup: open a terminal, `cd` to the project, launch `claude`; open Sublime Text and load the project; open Sublime Merge and load the project again; sometimes open a second terminal and `cd` again. The cost is small in isolation but ruinous in aggregate — 20+ active projects rotate through the queue, 3–4 are in flight on any given day, and each context switch pays the setup tax again. The setup friction discourages quick-pop-in visits to older projects and breaks flow when juggling several at once.

**The solution.** A macOS-only, single-user, open-source "lite IDE" wrapper that puts everything in one window:

- **VSCode-style project picker** — pick from a list of known projects, click, and the full environment fires up in <10s.
- **Left half: Claude Code**, in yolo mode by default, already `cd`'d into the project.
- **Right half: a built-in lite editor + git diff viewer** covering the daily-use Sublime Text features (multi-cursor / column selection, Cmd+P fuzzy file finder, command palette for syntax selection, project-wide find/replace, split panes, minimap). A hotkey pops the real Sublime Text or Sublime Merge as a separate window for the rare cases that need it.
- **Stateful CC controller, not just an embedded terminal.** The wrapper owns the CC process lifecycle, watches workflow state files (`workflow/.session.md`), and exposes workflow operations as clickable buttons.
- **Always-visible cross-window CC status indicator.** Every wrapper window's header shows the **idle-vs-running** state of *every* open wrapper window's CC instance — so by looking at window #1 (project A) the user can already see that window #2 (project B) is now idle and waiting for input. No clicking around to check on other projects. Detection uses CC's official hook channel (`UserPromptSubmit` / `Stop` / `Notification`) — never PTY output scraping. State is shared between wrapper processes via a small file in the app-support dir.
- **A thin orchestration layer above CC.** Clickable buttons for every custom workflow skill — no typing slash commands. A single "Recycle Session" button performs the manual ritual (`/session-pause` → wait for completion → Ctrl+D → spawn fresh CC → `/session-resume`) in one click. Triggered on user judgment, never automatically.
- **Smart auto-resume on project open.** The wrapper inspects two source-of-truth signals when a project opens — the presence of `workflow/.session.md` and whether CC has a resumable conversation for the project dir — and fires the right command without the user having to remember which one applies. Three branches:

  | State signal | Meaning | Fire |
  |---|---|---|
  | `workflow/.session.md` exists | Clean pause via `/session-pause` — explicit next-step recorded | `/session-resume` |
  | No `.session.md`, but CC has a resumable conversation for this project dir | Mid-step termination (closed wrapper, powered off, crash) — CC remembers, workflow doesn't | `/resume` (CC native) |
  | No `.session.md`, no resumable CC conversation, OR last action was a terminal-close (ship/finalize/resolve with no follow-up queued) | Fresh start | `/session-start` |

  Edge cases: if BOTH signals fire (`.session.md` exists AND CC has a resumable conversation), prefer `/session-resume` — workflow context is richer than raw conversation history; the user can manually `/resume` afterward if needed. Terminal-close cases (feature-finalize, task-close, incident-resolve, product-finalize) naturally fall into the fresh-start branch because closing skills don't write `.session.md`. No staleness heuristic on `.session.md` — trust it; `/session-resume` itself can sanity-check. Per-project memory of "what to fire next" is intrinsic to the source-of-truth files; no separate "next-command" state is persisted.

- **Drive-mode selector + indicator in the window header.** The four drive modes (1 step-by-step / 2 orchestrated / 3 autopilot / 4 full-autopilot) govern how aggressively the workflow orchestrator chains between skills. Today they're selected via prompt text with no visible reminder of the active mode. The wrapper renders a small selector in each window's header — current mode always visible, click to change. Persisted per-project; mirrored into the active WIP file's `drive_mode:` frontmatter so the wrapper UI and the workflow's pause-policy logic agree on a single source of truth.

Built with Tauri (Rust backend, web frontend) to stay genuinely lightweight.

## Target Audience

**Single user: the author (Stayman).** This is a personal tool, designed against one person's exact workflow — heavy Claude Code use, the custom workflow-system skill set installed at `~/.claude/skills/`, daily use of Sublime Text, macOS-only, 20+ rotating projects. Open-sourced so anyone running a similar setup can use or adapt it, but no design concession is made for users who don't share the workflow.

## Success Metrics

1. **Time-to-productive on a project drops from ~minutes to <10s.** Click a project in the picker → CC is running in the project dir, editor is loaded, ready to type.
2. **The clean-context ritual becomes one click instead of a 4-step manual dance.** "Recycle Session" replaces pause → Ctrl+D → fresh launch → resume.
3. **Never have to type a slash command again for common skills.** Every installed workflow skill is a clickable button in the right context.
4. **Finding the awaiting-input CC across multiple open projects takes <1 second of visual scan, zero clicks.** When 3–4 wrapper windows are open, glancing at the status indicator in any one of them is enough to know which other instance just went idle.
5. **Returning to a project is one click, regardless of how the prior session ended.** Whether the last session was paused with `/session-pause`, killed mid-step by a power-off, or cleanly closed at finalize, clicking the project drops the user into the exact right resumption state without choosing between `/session-resume`, `/resume`, and `/session-start` manually. The active drive mode is always visible in the header — no prompt-level ritual to recall it.

## Core Principles

1. **Lite over featureful.** If it's not a daily friction, don't build it. Reject scope that turns this into a general-purpose IDE.
2. **CC-process-aware AND workflow-state-aware, not just terminal-embedding.** The wrapper understands CC lifecycle (idle vs running) via Claude Code's official hook channel — `UserPromptSubmit` / `Stop` / `Notification` events written to `~/.claude/settings.json` — and parses workflow state via known files (`workflow/.session.md`, active WIP file frontmatter, `.claude/skills/`). It uses those signals to make the right decision on project open (which of `/session-resume`, `/resume`, or `/session-start` to fire) and to keep its UI honest (drive-mode indicator reflects the WIP file's `drive_mode:` frontmatter, not a separate in-memory toggle). It NEVER infers state by scraping the terminal's text output. This is the architectural line that separates this tool from "tmux with a nicer skin."
3. **Sublime Text is sacred.** The built-in editor preserves the daily-use Sublime features (multi-cursor, Cmd+P, command palette for syntax, project find/replace, split panes, minimap). For anything beyond, a hotkey pops the real Sublime as a separate window — no second-class compromise.
4. **One window, fewer prompt-level rituals.** The user should never manage windows; right-half swapping (editor / diff viewer / second terminal) happens inside the wrapper. Persistent controls live in the window chrome — the drive-mode selector in the header is the canonical example: a state that affects how every skill runs should be visible at a glance and changeable with one click, not buried in prompt text the user has to remember to type.
5. **No script-per-project, no per-project config burden.** Adding or removing a project from the picker is trivial — no `.wrapper.json` per repo, no bespoke launcher per project.

## Anti-Goals

- Not a VSCode replacement or general-purpose IDE.
- Not cross-platform — macOS only.
- Not multi-user; no team or sharing features.
- Not a Claude Code fork — wraps the official CLI.
- Not an extension ecosystem.

## Future Possibilities (Not in Initial Roadmap)

Noted here so the architecture leaves room for them; explicitly NOT scoped into the initial roadmap.

- **Migrate workflow state-machine enforcement into the wrapper.** Today the state machine documented in `~/Personal/projects/my-claude-code-customization/docs/product/transitions.md` (product / feature / task / incident workflows; SURFACE / ESCALATE / REDIRECT cross-level mechanisms; AUTO/PAUSE drive modes; back-loop guards) is enforced advisorily — purely through `~/.claude/CLAUDE.md`, the per-workflow `AGENTS.md` orchestrator files, and individual skill prompts. Tuned to acceptable consistency but not perfect. The wrapper, as a stateful CC controller that already watches `workflow/.session.md` and can read `.claude/skills/`, is well-positioned to host harder enforcement (e.g., warn or block on out-of-state skill invocations) and to render a GUI visualization of the current workflow state, valid next transitions, drive mode, pending SURFACE/ESCALATE items, and back-loop history. Build the wrapper so this is a natural future addition — don't paint into a corner that assumes CC is a black box.
- **Time tracking integration.** The existing `claude-time` hook system at `~/Personal/projects/my-claude-code-customization/tools/claude-time/` logs Claude Code hook events to a local SQLite DB and produces per-project / per-session / per-day time reports (tool time, active time, reading/thinking/away buckets, cross-session typing-debit attribution). The wrapper can plug into this in two ways down the line: (1) **richer signals** — wrapper-level events (project opened, panel swapped, Sublime popped, Recycle Session clicked, skill button clicked) feed the same SQLite DB to give a more precise picture than hook events alone; (2) **in-window visibility** — surface `claude-time report` output (today's totals, per-project breakdown) inside the wrapper UI rather than requiring a separate terminal invocation. Particularly valuable for the multi-project rotation use case where "where did this week actually go" is a real question. **Note:** the in-roadmap cross-window CC status indicator (Phase 2) already taps the same hook channel (`UserPromptSubmit` / `Stop` / `Notification`) that `claude-time` uses, so the wrapper will already be registering a hook handler in `~/.claude/settings.json` by the time this future integration matters — sharing or co-locating with `claude-time` should be straightforward.
