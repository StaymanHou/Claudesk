---
name: installed-skills-are-symlinks-into-the-mccc-repo
description: "Every skill under ~/.claude/skills/ is a symlink into the my-claude-code-customization repo, so editing an installed skill file silently dirties a DIFFERENT git repo; copy with cp -RL and diff that repo's git status before/after."
metadata:
  node_type: memory
  type: reference
---

**Every entry under `~/.claude/skills/` is a SYMLINK** into `/Users/stayman/Personal/projects/my-claude-code-customization/skills/`. Editing an installed skill file therefore writes into a **different git repository** and silently dirties it from inside an unrelated session.

⚠️ **`~/.claude/skills` itself is a real directory**, so the hazard is **per-entry** and easy to miss — an `ls -ld` on the parent tells you nothing.

**The safe pattern** (used by M15 WP1's Q3 frontmatter experiment):

1. `cp -RL ~/.claude/skills/<name> <scratch>/` — the **`-L` dereferences**. A plain `cp -R` copies the *symlink*, and a later write goes straight through to the source.
2. Work only inside gitignored scratch.
3. **Verify by diffing the OTHER repo's `git status --porcelain` before and after.** ⚠️ The absence of an error message proves nothing — the failure is silent by construction.

⚠️ **Not a duplicate of the project `CLAUDE.md` note**, which documents the `_ref/claude-customization/` symlink for **reading**. Different path, different failure mode (read vs write).

Relevant to any skill-frontmatter experiment — **M15 WP2** is the likeliest to try one. Evidence: `backlog.md` → `SURFACE-2026-09-11-EVERY-INSTALLED-SKILL-IS-A-SYMLINK-INTO-THE-MCCC-SOURCE-REPO`.
