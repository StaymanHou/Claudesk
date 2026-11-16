---
name: drive-status-channel-with-real-hook-script
description: Drive the status channel deterministically with no CC turn: pipe a crafted payload into the working-tree claudesk-hook.pl at the dev hook.sock (+ CLAUDESK_ORIGIN for remote).
metadata:
  type: project
---

To check what the status SURFACES do with a given hook event, fire the REAL producer yourself instead of
coaxing CC into a turn (used at M17 WP4 P2/P3 verify-self, 2026-11-16):

```sh
printf %s '{"hook_event_name":"Notification","session_id":"probe","cwd":"<workspace path>","message":"m","notification_type":"permission_prompt"}' \
  | env -u CLAUDESK_DRIVE_MODE -u CLAUDESK_ORIGIN \
    CLAUDESK_HOOK_SOCK="$HOME/Library/Application Support/com.claudesk.app.dev/hook.sock" \
    /usr/bin/perl src-tauri/resources/claudesk-hook.pl
```

- **For a REMOTE-routed event** set `CLAUDESK_ORIGIN=<hash8(host)>` instead of removing it. Running the
  deployed copy ON the mini with the remote `hook.sock` path also exercises the `-R` forward.
- **Observables:** one `STATUS event=… mapped=… resolved=<ws-id|none> outcome=emitted|dropped` line per event
  in the dev `status-channel.log`, plus the dot classes over the bridge
  (`[data-testid="workspace-status-indicator"] .status-dot`, and `windowId: pip` for the PiP).
- **Deterministic:** the exact event, cwd and origin. It is the real script and the real drain (not a
  mock), and it takes milliseconds.
- **Not a substitute** for one real CC turn when the question is what CC itself sends (`cc-hook-event-facts`).

Related: [[cc-hook-capture-beats-docs]], [[mcp-bridge-seed-held-workspace-status-via-fiber]] (that one
fakes the MAP; this one drives the real channel).
