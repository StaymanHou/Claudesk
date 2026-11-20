---
name: signal-test-kill-can-land-before-the-fork
description: A kill sent the moment a script's sentinel line arrives can reach the group before the protected child is forked, so a "the trap holds" test passes vacuously; delay the kill well inside the step. And zsh resets an ignored trap inside a `( … )` subshell.
metadata:
  type: project
---

**The trap (M18 WP7 Phase 1, 2026-11-20).** WP6's `a_group_kill_after_the_install_phase_cannot_split_links_from_the_record`
sent `kill -TERM -- -<pgid>` as soon as the stream showed `CLAUDESK-RUN:phase:install`. The kill landed ~2 ms in, BEFORE zsh had
forked `( cd … && ./install.sh )`, so nothing was there to kill and the test passed. A TERM at 5 ms … 1.5 s killed `install.sh`
(exit 143) between two links: the "untrappable" install window shipped split. Measured with a perl fork/`setsid`/`kill(-pgid)`
harness at delays 0, 2, 5, 10, 20, 50, 500, 1500 ms.

**The cause:** zsh resets an ignored trap (`trap '' HUP PIPE TERM INT`) inside a `( … )` subshell, so the subshell and its children
die on the signal. A DIRECT child of the trapping shell (`cd -- "$x" && ./install.sh …`, no parentheses) inherits SIG_IGN and survives
TERM, HUP and INT at every delay.

**How to apply:**
- A test that proves "a signal in window W changes nothing" must deliver the signal WELL INSIDE W, with the step slowed by a fixture
  (`KILL_DELAY` = 300 ms after the sentinel, plus `FIXTURE_SLEEP` in the fixture `install.sh`), never on the sentinel line itself.
  The positive control is putting the bug back: the subshell restored must make the test FAIL.
- A host-side script's protected window runs its children directly, never in `( … )`. Pin that with a builder assertion (no `( cd`)
  as well as the real-signal test. The Uninstall template still lacks both (`SURFACE-2026-11-20-QUALITY-UNINSTALL-WINDOW-UNPINNED`).
- Related: [[verify-the-mutation-landed]] (a mutant must change executable code), [[behavioral-test-can-still-be-an-equivalent-mutant]].
