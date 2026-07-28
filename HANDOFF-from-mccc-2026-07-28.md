# Handoff — the workflow system's part is SHIPPED → Claudesk's return contract

**From:** the **`my-claude-code-customization`** repo (`/Users/stayman/Personal/projects/my-claude-code-customization`) — the custom CC workflow system
**To:** this repo — **Claudesk** (`/Users/stayman/Personal/projects/claudesk`)
**Date:** 2026-07-28
**Author:** the workflow system's WP8 / Milestone 12 close (operator: Stayman)

**Closes the loop opened by:** [`HANDOFF-from-claudesk-2026-07-20.md`](../my-claude-code-customization/HANDOFF-from-claudesk-2026-07-20.md) → §"What Claudesk needs back from you (the return contract)" (that file lives at the *other* repo's root).

---

## Why you're getting this

On 2026-07-20 Claudesk handed the workflow-system repo **five items** it owned — properties of the skills/install/docs convention rather than of the app — and the operator set the execution order: **the workflow repo ships first, then Claudesk builds its M10.9 gate + rich invite, then M11.** The reason was that Claudesk's invite/onboarding would otherwise hardcode against a moving target.

**All five are now shipped.** This note is the reciprocal handoff: what changed, and the three deliverables Claudesk's M10.9 + M11 were waiting on.

**Execution order is now unblocked — Claudesk is clear to build M10.9 and M11.**

| # | Inbound item | Status |
|---|---|---|
| 1 | Standalone `uninstall.sh` + canonical `install.sh` | ✅ shipped (Milestone 8) |
| 2 | Unify the workflow doc folders | ✅ shipped (Milestone 7) — **see the required change below** |
| 3 | Disambiguate "pause" | ✅ shipped (Milestone 9) |
| 4 | Resolve the "research" naming collision | ✅ shipped (Milestone 10) |
| 5 | Design the new-user onboarding + aha moments | ✅ shipped (Milestone 11) — built, not just designed |

---

## ⚠️ ONE REQUIRED CHANGE ON CLAUDESK'S SIDE (read this first)

Everything else in this note is reference material. **This item is actionable and load-bearing.**

Item #2's folder unification landed, and Claudesk's own repo **has already been physically migrated** to the new layout (HEAD `aacc687`, "chore: migrate doc layout to workflow-system/"). `workflow-system/product/` and `workflow-system/state/` exist here; `docs/product/`, `workflow/wip/`, and `workflow/backlog.md` are **gone**.

**But this repo's M11 spec still describes the old paths.** `workflow-system/product/wbs.md:60` — M11 WP2 task 2.1, still unbuilt (`- [ ]`) — specifies `docs_list` discovery over:

> `docs/product/*.md` (vision, roadmap, research, arch, context) + glob `*wbs*.md`, `workflow/wip/*.md`, `workflow/backlog.md`, `workflow/.session.md`

**Building WP2 as currently specified would produce a `docs_list` that finds nothing** — every path it globs was migrated away.

This is a **spec correction, not a code change**: `docs_list`/`docs_read` are not implemented anywhere in `src/` or `src-tauri/` yet, so nothing built needs fixing. Filed as a SURFACE in this repo's backlog (`SURFACE-2026-07-28-M11-DOCS-LIST-PATHS-STALE`) rather than edited directly, because **this repo's `/product-wbs` owns its own spec** — and the correction carries a real design question that is Claudesk's to settle (flat-glob vs. enumerate; see the SURFACE).

### The settled layout — old → new

| Old path | New path |
|---|---|
| `docs/product/*.md` | `workflow-system/product/*.md` |
| `workflow/wip/*.md` | `workflow-system/state/wip/*.md` |
| `workflow/backlog.md` | `workflow-system/state/backlog.md` |
| `workflow/.session.md` | `workflow-system/state/.session.md` |
| `docs/product/archive/` | `workflow-system/product/archive/<cycle-name>/` |

Two properties worth knowing before implementing discovery:

- **`.session.md` is gitignored but present on disk.** It is a transient single-file session pointer, deleted on restore. `docs_list` must not assume git-tracked ⇒ discoverable.
- **The `*wbs*.md` glob is deliberate and still correct.** It catches the canonical `wbs.md` *and* temporary/scratch WBS files (e.g. the `shape: temporary-wbs` output of the `util-backlog-paydown` skill). Keep it a glob, not a literal.

Durable docs (`vision.md`, `arch.md`, `roadmap.md`, `transitions.md`) stay in `workflow-system/product/` across cycles; cycle-scoped docs (`wbs.md`, `research.md`) are archived to `workflow-system/product/archive/<cycle-name>/` on cycle close.

---

## Deliverable 1 — canonical install-instruction copy + commands

**Source of truth (read these, don't copy them):** `README.md` → §Setup, plus `install.sh` and `uninstall.sh` at the workflow repo's root.

The literal commands, inlined because the invite must be actionable without a second lookup:

```bash
# Install
git clone git@github.com:StaymanHou/stayman-claude-code-customization.git ~/Personal/projects/my-claude-code-customization
cd ~/Personal/projects/my-claude-code-customization
./install.sh

# Uninstall (standalone — zero Claudesk dependency)
cd ~/Personal/projects/my-claude-code-customization
./uninstall.sh
```

What the invite should convey about `install.sh`:
- Creates **per-skill, per-agent, and per-hook symlinks** into `~/.claude/skills/`, `~/.claude/agents/`, `~/.claude/hooks/`.
- Injects `CLAUDE.snippet.md` into `~/.claude/CLAUDE.md` between `<!-- BEGIN/END claude-workflow-system -->` markers, writing a one-time `.bak` on first modification.
- **Idempotent** — safe to re-run; refreshes the marker block rather than appending.

What matters for the **try-and-back-out** story that motivated item #1: `uninstall.sh` is **standalone and defensive** — it reverses the symlinks, the hook registrations, and the marker-delimited `CLAUDE.md` block with **zero Claudesk dependency**, so a curious user can try the system and remove it with no residue. It is into-repo-guarded, excises only the marker block (never the user's own `CLAUDE.md` content), and gates the per-project memory-symlink removal behind an explicit `--project <dir>`.

---

## Deliverable 2 — the settled doc-folder layout

Covered in full under the required-change section above. Reference sources in the workflow repo:

- `CLAUDE.md` → §"State persistence is per-project, not here" — the authoritative per-project layout.
- `workflow-system/product/arch.md` → **AD-1** — the decision record + the migration mapping. ⚠️ Its left-hand column names the *old* paths on purpose; it is history, not current state.

---

## Deliverable 3 — the onboarding flow spec

**Source of truth:** the workflow repo's `workflow-system/product/onboarding-flow-spec.md`, specifically **§4 "Claudesk Surface Contract"** (§4a what Claudesk renders · §4b when · §4c what Claudesk must NOT hardcode). **Build M10.9 against §4, not against the flow internals.**

Item #5 was brainstormed, designed, *and built* — Milestone 11 shipped a four-skill `tutorial-*` family, not just a spec.

### The coupling, in one line

**Claudesk points the user at exactly one slash command: `/tutorial-getting-started`.** That is the whole interface.

### §4c — the anti-brittleness clause (the most important thing in this note)

**The ONLY stable coupling Claudesk may depend on is the command name `/tutorial-getting-started`.** Everything else is owned by the workflow repo and evolves independently. Claudesk **must NOT** hardcode:

- the tour's **flow, steps, beats, or copy** — these live in the `tutorial-*` skills;
- the **greenfield/brownfield path choice** — the fork happens *inside* the entry skill, after entry; Claudesk must not pre-select a path;
- the **permission-mode instruction** — mode guidance is delivered by the skill, not by invite copy.

That last one is proven rather than asserted: the recommendation changed from `acceptEdits` to `auto` mid-cycle and the change landed **entirely in the workflow repo, with zero Claudesk changes.** That is the payoff of the clause — keep it and mode guidance stays a one-repo edit.

If the command name ever changes, that is a return-contract change communicated back through this same channel. The name is treated as a **published interface** (the workflow repo pins it structurally and guards it with behavioral scenarios, so it will not drift silently).

### When to show it (§4b)

- **Once**, as a one-time invite — not a persistent nag. After the user has run or explicitly dismissed `/tutorial-getting-started`, do not re-surface it.
- Only when Claudesk's workflow-coupled opt-in is active (your M10.9 gate).

### Two facts that save you work

1. **The tour is self-contained in the skill install — there is no extra sample-fetch step to document.** The greenfield tour's runnable sample + scaffolder ship *inside* the skill's own directory (`skills/tutorial-greenfield-workflow-tour/scripts/`), and `install.sh` symlinks each skill's **whole directory**. An invited user gets the sample automatically.
2. **Honest framing is an invariant, not a preference.** The tour is a **narrated real run of ~10–15 minutes** — it really executes things, writes files, and hands off across a session boundary. The spec **forbids** promising a "quick 5-minute" tour, and the workflow repo enforces that with structural pins. **Invite copy must not promise a 5-minute demo.**

---

## Where to look for more detail (workflow-repo side)

Root: **`/Users/stayman/Personal/projects/my-claude-code-customization`**.

| What you need | Read |
|---|---|
| The Claudesk surface contract | `workflow-system/product/onboarding-flow-spec.md` §4 |
| Install / uninstall mechanics | `README.md` §Setup · `install.sh` · `uninstall.sh` |
| The settled doc layout | `CLAUDE.md` §"State persistence is per-project" · `arch.md` AD-1 |
| What shipped, when, and why | `CHANGELOG.md` (2026-07-21 → 2026-07-28) |
| The tour's session-chain flow | `docs/lessons/tutorial-tour-session-chain-flow.md` |

This handoff is the summary; those files are the source of truth. When a Claudesk-side decision needs a workflow-side detail, read them directly rather than trusting this note to stay current.

---

## What the workflow repo needs back (nothing blocking)

No reciprocal deliverable is required — this closes the contract. Two courtesies, if convenient:

1. **If Claudesk's M11 `docs_list` ends up needing a layout change** (e.g. a stable index file, or a manifest instead of globs), send it back the same way; the workflow repo can accommodate it, and discovering it during M11 is cheaper than after.
2. **If the one-time invite's copy needs a shorter value-prop line** than the spec's framing provides, ask rather than writing one — the honest-framing invariant is load-bearing and structurally enforced, so a Claudesk-authored "quick tour" line would contradict a pinned invariant.
