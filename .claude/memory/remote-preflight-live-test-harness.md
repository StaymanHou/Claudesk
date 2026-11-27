---
name: remote-preflight-live-test-harness
description: To check the "Add remote project…" preflight against a real host, run the existing ignored test live_preflight_against_a_real_host with env vars; no source edit, no host name on disk.
metadata:
  type: reference
---

The repo already has a live harness for the add-time preflight (`remote_cmd::preflight`): the ignored test
`remote_cmd::preflight::tests::live_preflight_against_a_real_host`. It runs the real `run_preflight(&SshExec, host, path)`
and prints each check (`PASS/FAIL <name> <message>`) plus `resolved_path`. Read-only on the remote.

```
export PATH="$HOME/.cargo/bin:$PATH" && cd src-tauri && \
CLAUDESK_TEST_REMOTE_HOST=<user>@<mini-host> CLAUDESK_TEST_REMOTE_PATH='~/claudesk-scratch-remote' \
  cargo test --lib -- --ignored --exact remote_cmd::preflight::tests::live_preflight_against_a_real_host --nocapture
```

- The host comes only from the environment, so it never lands in a tracked file (this repo is public). Take the
  host part from the dev `projects.json`'s `ssh://` key but the USER from [[mini-remote-user-is-stayman]] (never the
  admin account written in that key).
- Use the scratch folder, per [[remote-verify-hygiene]].

**Why:** paydown-2026-11-27 WP6 verify-self planned a throwaway `#[ignore]` test (edit, back up, restore, shasum) to do
exactly this; the runner found the existing harness and needed no source edit. **How to apply:** reach for it whenever
a change touches the preflight's connect step, check script or check names.
