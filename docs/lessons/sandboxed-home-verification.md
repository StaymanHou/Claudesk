# Sandboxed-`$HOME` launch — verifying a `~/`-touching feature safely

**Established 2026-07-30 (M10.9 WP3.5a).**

Any feature whose behavior depends on `$HOME` (`~/.claude/`, `~/.claudesk/`, dotfile detection, an
installer) has a verification problem: the operator's real home is the one place it must never be
exercised — and on the operator's machine that home is often in the *exact* state that hides the
feature. Their `~/.claude/skills/` symlinks into a live repo made the install wizard **correctly
invisible**, so the primary path was untestable.

**The answer is to launch the dev build with an injected home.**

## The command

```bash
mkdir -p /tmp/<scratch>/fake-home/.claude          # stage whatever state the arm needs
HOME=/tmp/<scratch>/fake-home \
RUSTUP_HOME=/Users/<you>/.rustup \
CARGO_HOME=/Users/<you>/.cargo \
PATH="/Users/<you>/.cargo/bin:$PATH" \
pnpm tauri:dev
```

⚠️ **The three overrides after `HOME` are mandatory, not optional.** Overriding `HOME` alone
relocates `~/.rustup`, and the build dies with *"rustup could not choose a version of cargo to run"*
**before the app ever launches**. That failure looks like a toolchain problem and is really a
sandboxing side effect.

## Why this works, and is safe

The `workflow_install` module resolves `HOME` **fresh on every call** in its `commands` layer and
takes every other root as a parameter; `env_path` only ever rewrites `PATH`. So nothing caches or
reconstructs the real home.

⚠️ **Any future feature wanting this treatment must keep that shape** — injectable roots below the
commands layer, no ambient `home_dir()`. This is the same discipline
`SURFACE-2026-07-28-MCCC-INSTALL-FEATURE-NEEDS-SANDBOXED-DEV-AND-VERIFY` mandates for its own
reasons.

## Two things to know before using it

1. **The app's own data dir and `projects.json` relocate too**, so the picker looks empty and recents
   are gone. Expected, harmless — a throwaway profile.
2. **Stage the fake home to the arm you want to see, and re-stage between runs.** After a successful
   install it reads `managed`, so the `absent` affordance disappears until you `rm -rf` the fake
   `.claude/` **and** `.claudesk/`. The provenance record is what keeps it `managed`, and
   `uninstall.sh` deliberately leaves that record behind.

## Verify containment after — every time

- `ls -l ~/.claude/skills | head -3` → targets unchanged
- `ls ~/.claudesk/install-record.json` → absent
- the real `~/.claude/CLAUDE.md` mtime predating the run

**This is what made WP3.5a's safety model *proven* rather than asserted.** A real network clone plus
a real `install.sh` ran end-to-end and landed entirely inside the injected root. A test could not
have shown that; the sandboxed launch did.

## Related

- [`mcp-tauri-bridge-caveats.md`](mcp-tauri-bridge-caveats.md) — driving the sandboxed build once
  it's up.
- `arch.md` → "Milestone 10.9 WP3.5a architecture" — the provenance-not-abstinence safety model this
  verifies.
