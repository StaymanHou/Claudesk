---
name: open-w-truncates-before-read-wipes-untracked-file
description: `open(p,'w').write(open(p).read())` truncates p BEFORE the read runs — it wiped an untracked arch doc; copy an untracked file aside before any scripted edit.
metadata:
  type: feedback
---

**Never write `open(p, 'w').write(open(p).read())` (or any form where the write-open is evaluated before the
read).** Python evaluates `open(p, 'w')` first, which truncates the file to 0 bytes; the argument's
`open(p).read()` then reads the empty file. On 2026-11-14 (M17 WP1) a trailing "no-op re-save" line in an
in-place edit script did exactly this to `workflow-system/product/arch/remote-workspaces.md` — **untracked**,
so git had no copy, there was no Time Machine and no `~/.claude/file-history` backup.

**Why it was recoverable:** the session transcripts (`~/.claude/projects/<slug>/*.jsonl`) hold the file's
original `Write` content and every later `Edit`/script. Replaying them in order in memory (scripts exec'd with
`open` redirected so only the target file's ops apply) rebuilt it, and every `Read` capture taken during the
session matched the replay at its timestamp. That is the recovery path if it ever happens again — but it is
slow and only works when every edit went through a recorded tool call.

**How to apply:**
- Before a scripted (python/perl/sed) in-place edit of a file `git status` shows as `??`, `cp` it into the
  scratchpad first (and `shasum` it). Untracked strategic docs have no safety net.
- In edit helpers, read into a variable, then write: `s = open(p).read(); ...; open(p, 'w').write(s)`.
  Never re-save a file "just in case" — a no-op line has no upside.
- Prefer the Edit tool for doc edits: it is exact-match, fails loudly, and leaves a replayable record.

Related: [[git-checkout-no-ops-on-untracked-file]], [[verify-the-mutation-landed]].
