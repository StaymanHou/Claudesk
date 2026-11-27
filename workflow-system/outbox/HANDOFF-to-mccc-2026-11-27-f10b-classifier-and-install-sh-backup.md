---
from: /Users/stayman/Personal/projects/claudesk
kind: bug-report
date: 2026-11-27
summary: Two small upstream bugs — the F10b handback measurement counts a correct FSD chain as a stop, and an install.sh re-run destroys an existing ~/.claude/CLAUDE.md.bak and resets the file to 0600
---

# Two small upstream bugs found from the Claudesk side

Both were found during Claudesk work and are mccc-owned. Both were re-checked against mccc `f8e8873`
(2026-11-16) on 2026-11-27 and are still present. They're independent; take either one alone.

## 1. `tools/analysis/measure-f10b-handback-rate.py` counts every FSD F10b turn as a stop

**What's wrong.** `vh()` (line ~71) counts an F10b turn as chained only if the next assistant turn
invokes `feature-verify-human`. But in **FSD**, F10b correctly SKIPS verify-human and chains into
`feature-verify-codify`, and the drive-mode gate `AUTO = re.compile(r"autopilot|\bFSD\b|full self.driv", re.I)`
admits FSD turns. So every FSD F10b turn reads as a handback.

**Evidence (Claudesk transcripts, 2026-11-08/09).** All 8 post-fix "stops" were this case: 3 in a
`--since 2026-09-22` reading (shown as a 1.5% residual) and 5 more in `--since 2026-11-04` (shown
as 8.1%). Each was checked by hand, and each chained into `feature-verify-codify`. The corrected
post-fix rate is **0 of 257**. A reading of 8.1% would have triggered the "rate climbing back
toward 7% reopens the upstream ask" branch of the F10b close rule on a pure instrument artifact.

**Suggested fix.** In FSD context, count a `feature-verify-codify` invocation as the chain (more
generally: accept the drive mode's expected next skill). Add a fixture with one FSD F10b → codify
turn that must read as chained. Then re-derive the pre-fix baselines in
`tests/results/M-PROSE-SHIP-BASELINE.md`, which may carry the same inflation wherever FSD sessions
fall inside their windows, and see whether any moved.

**Done when:** an FSD F10b → `feature-verify-codify` turn reads as chained (pinned by a fixture),
and the baselines are re-derived or confirmed unchanged.

## 2. `install.sh` re-run deletes an existing `~/.claude/CLAUDE.md.bak` and resets the mode to 0600

**What's wrong.** On the "block already present" path (`install.sh` ~lines 124–149):

1. `cp "$GLOBAL_CLAUDE_MD" "${GLOBAL_CLAUDE_MD}.bak"` overwrites whatever `.bak` was already there.
2. `mv "$updated_tmp" "$GLOBAL_CLAUDE_MD"` replaces the file with a `mktemp` file: new inode, new
   mtime, and mode **0600** (mktemp's mode) instead of the original mode.
3. `cmp -s` then finds nothing changed and runs `rm "$backup"`.

So a re-run is content-idempotent but not metadata-idempotent, and it silently destroys any
pre-existing `CLAUDE.md.bak`: the user's own backup under that name, or the backup an earlier
`[update]` run kept.

**Evidence.** Measured in a sandbox root on a test Mac, 2026-11-20 (Claudesk M18 WP3 probe): a
planted `.bak` holding other content was gone after one re-run, and `CLAUDE.md` went from 0644 to
0600 with the same sha256.

**Why it matters now.** Claudesk's remote "Update" (M18 WP7) re-runs `install.sh` on a managed
install, so every Update carries this. The 0600 mode is harmless for the owning user; the lost
`.bak` is the real cost.

**Suggested fix.** Either write the backup to a fresh name (`CLAUDE.md.bak.<timestamp>`), or only
`cp` to `.bak` when the result will differ (compare `$updated_tmp` against the original before
touching `.bak`). And keep the original file's inode and mode: `cat "$updated_tmp" > "$GLOBAL_CLAUDE_MD"`
instead of `mv`. The same `mv` pattern is on the `.new` path (~line 166) and may want the same
treatment.

**Done when:** a re-run with the block already current leaves a pre-existing `CLAUDE.md.bak`
byte-identical and keeps `CLAUDE.md`'s mode. A test or a `tests/` sandbox check pins both.

## Claudesk side

No Claudesk change is needed for either. Claudesk's backlog entries
(`SURFACE-2026-11-09-F10B-MEASUREMENT-COUNTS-A-CORRECT-FSD-CHAIN-AS-A-STOP`,
`SURFACE-2026-11-20-INSTALL-SH-RERUN-DELETES-AN-EXISTING-CLAUDE-MD-BAK`) stay open until mccc applies
or declines each one. A reply to the Claudesk inbox is welcome but not required.
