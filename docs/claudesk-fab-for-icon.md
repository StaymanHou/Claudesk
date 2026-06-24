# Claudesk — FAB Brief (for icon design)

A Features / Advantages / Benefits brief to hand to an icon designer (human or AI).
The goal: an app icon that captures *what Claudesk is* and *how it feels to use* —
so the visual metaphor is grounded, not generic.

---

## What Claudesk is (one paragraph)

Claudesk is a **macOS-only, single-user "lite IDE"** that puts the daily
**Claude Code + Sublime** workflow into **one window with multiple virtual
workspaces inside it**. Each workspace = one project = one live Claude Code (CC)
session: a true terminal on the left, a lite code-editor + git-diff viewer on the
right. A **Mission-Control-style layout** runs the show — one workspace is the
full-size *center stage*, and a *filmstrip* of live thumbnails/status-tiles across
the top shows every other open project at a glance, each with an
**idle / running / awaiting-input** status dot. Click a tile (or press a hotkey)
to promote that project to center stage. It replaces the operator's old routine of
juggling terminal tabs, Sublime Text, and Sublime Merge across many windows and
macOS Spaces.

**Tech feel:** Tauri 2 (tiny ~3 MB native app, not Electron), **dark-mode only —
always**, fast (<500 ms startup), lean. The aesthetic is *quiet, dark,
keyboard-driven, dense-but-calm* — a tool for a power user running 20+ rotating
projects, 3–4 in flight on any given day.

---

## Features → Advantages → Benefits

### F1. One window, many project workspaces (Mission-Control layout)
- **Feature:** A single window holds N concurrent project workspaces — one
  full-size *center stage* + a *filmstrip* of the rest across the top.
- **Advantage:** No window-juggling, no Spaces-hopping. Every in-flight project is
  one glance and one click away.
- **Benefit:** The operator instantly sees *which project needs them right now* and
  switches to it without breaking flow.

### F2. Per-workspace status at a glance (idle / running / awaiting-input)
- **Feature:** Every filmstrip tile carries a live status dot driven by Claude
  Code's real lifecycle (not guesswork): **idle**, **running**, or
  **awaiting-input**.
- **Advantage:** The "which of my 4 running agents is waiting on me?" question is
  answered in <1 second, zero clicks.
- **Benefit:** No more clicking through windows to find the one stalled on a prompt.

### F3. Instant project launch
- **Feature:** Pick a project → its full environment (CC session `cd`'d in, editor,
  diff) fires up in <10 s as a new workspace.
- **Advantage:** Eliminates minutes of repetitive setup (open terminal → cd →
  `claude`, open Sublime, load project, open Merge, …) per project, per day.
- **Benefit:** Starting work on any of 20+ projects is one click, not a ritual.

### F4. Split workspace: terminal + editor side by side
- **Feature:** Left half = a true PTY-backed Claude Code terminal (the real
  interactive TUI). Right half = a lite code editor + git-diff viewer.
- **Advantage:** Drive the AI and see/read the code without leaving the window.
- **Benefit:** The whole edit-review-converse loop lives in one calm surface.

### F5. Lean, fast, dark, native
- **Feature:** Tauri 2 native app — ~3 MB, ~30–40 MB RAM idle, <500 ms launch,
  **always dark** (never follows OS theme).
- **Advantage:** Feels instant and unobtrusive; never the heavy thing on the
  machine.
- **Benefit:** A daily driver that disappears into the work instead of competing
  with it.

---

## Icon design direction

**Core metaphor (strongest):** the **Mission-Control / filmstrip-over-center-stage**
layout — the single visual idea that is *uniquely Claudesk*. A large focused panel
with a row of smaller tiles above it, one tile highlighted (the "focused / active"
one). This reads as "many projects, one in focus" at a glance.

**Alternative / complementary metaphors** (a designer may blend or pick):
- **Split workspace** — a panel divided left/right (terminal ╎ editor), echoing the
  core layout of every workspace.
- **The status dot** — a single glowing accent dot (idle/running/awaiting) is the
  app's emotional core ("which one needs me?"); could be a small but meaningful
  accent element.
- **"Desk" wordplay** — Claude-*desk*: a calm workspace surface. Subtle, optional.

**Palette / tone:**
- **Dark-first, always.** Deep charcoal/near-black base (#15171c–#23262e range).
  The icon should look at home in a dark Dock and never assume a light theme.
- **Single accent: a calm blue `#6ea8ff`** (Claudesk's real focus-accent token) —
  used sparingly to mark the *one focused/active* element. One accent, not a
  rainbow.
- **Mood:** quiet, precise, modern, power-user. NOT playful, NOT busy, NOT
  skeuomorphic. Think "developer tool that respects your attention."

**Constraints:**
- **Squared, transparent background**, supplied as **SVG** (it gets rasterized to
  the full macOS icon set — `.icns`/`.ico`/PNGs — via `tauri icon <file.svg>`).
- **Must read at 32 px** (Dock/Finder small size) as well as 1024 px. Keep the
  motif bold and uncluttered; fine internal detail (tiny text, hairlines) vanishes
  at small sizes.
- macOS rounded-square app-tile shape is fine (and conventional), but the artwork
  inside is what matters.

**A dev-build variant is also needed:** the **same base icon plus a clear "DEV"
badge** (a corner ribbon or bottom strip, high-contrast so it never blends with the
blue accent — e.g. amber). The dev build runs *concurrently* alongside the
installed prod build during dogfooding, so at Dock size the two must be
**instantly tellable apart**. (Only the badge differs; the base art is identical.)

**What to avoid:**
- Generic "terminal window with a `>` prompt" clichés — too common, says nothing
  specific.
- The literal Claude/Anthropic logo or any third-party app logo (Sublime, etc.).
- Light backgrounds or theme-adaptive art (Claudesk is dark-only by hard rule).
- Over-detailed scenes that turn to mud at 32 px.

---

## One-line summary for a prompt

> A dark, lean macOS "lite IDE" app icon: a Mission-Control-style layout — a row of
> small project tiles above one large focused workspace panel, with a single calm
> blue (`#6ea8ff`) accent marking the focused tile — on a deep-charcoal rounded
> square, transparent background, reads cleanly at 32 px, modern/quiet/power-user
> tone, dark-mode only. (Plus a variant with a high-contrast "DEV" badge.)
