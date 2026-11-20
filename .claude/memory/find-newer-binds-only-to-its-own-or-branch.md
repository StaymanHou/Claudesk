---
name: find-newer-binds-only-to-its-own-or-branch
description: In `find … -prune -o … -print`, a test before the first `-o` binds only to that branch; put the prunes first and `-newer` on the print branch, with a positive control.
metadata:
  type: project
---

`find` evaluates `A -o B -o C` left to right with `-a` (implicit) binding tighter than `-o`. So in

```
find "$HOME" -xdev -newer M -path R -prune -o \( <excludes> \) -prune -o -print
```

`-newer M` belongs ONLY to the first branch (the one that prunes `R`). The `-print` branch has no `-newer` test at all, and the sweep lists EVERY file under `$HOME` as "newer than the marker". The correct form:

```
find "$HOME" -xdev \( -path R -o -path X -o -path Y \) -prune -o -newer M -print
```

**Why:** M18 WP6 Phase 2 verify-self (2026-11-20) ran a host containment sweep after a sandboxed remote install. The wrong form reported `.zshrc`, `cc-oauth-token`, `.local/bin` and more as fresh writes. `stat` showed their mtimes were hours BEFORE the marker, which exposed the false finding. Host containment sweeps recur at M18 WP7 (Update / Uninstall) and WP8.

**How to apply:** prunes first, inside one `\( … -o … \)` group; the time test on the print branch. Always add a positive control, a path you KNOW is newer (the sandbox's own files), and check it appears. Before acting on any hit, `stat -f "%Sm %N"` a few of them against the marker. Related: [[remote-verify-hygiene]] (rule 7: probing a host without Claudesk).
