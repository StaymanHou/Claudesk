//! Write text to the macOS clipboard (M18 WP2.5).
//!
//! The one caller is the terminal's OSC 52 handler (`src/components/workspace/osc52.ts`): a remote
//! pane's tmux sends each copy (a drag, or remote CC's `/copy`) as OSC 52, and the handler hands
//! the decoded text here. ⚠️ **Write only.** Nothing here reads the clipboard, and the handler never
//! answers an OSC 52 read query, so no program in a pane can read this Mac's clipboard.
//!
//! Why not `navigator.clipboard.writeText` in the webview: WKWebView rejects it with
//! `NotAllowedError` unless there is live user activation. The probe measured that from a timer,
//! and an OSC 52 from CC's `/copy` arrives with no gesture. Why `pbcopy` and not a crate: no new
//! dependency, and the bounded subprocess runner already exists.
//!
//! ⚠️ **`pbcopy` needs `LANG`.** Without it, `pbcopy` reads its input as MacRoman: `héllo` landed as
//! `h√©llo` (measured with `env -i`). A Finder-launched app has no `LANG`, because `env_path` captures
//! only `PATH`. So the child always gets `LANG`/`LC_ALL=en_US.UTF-8`.

use std::path::Path;
use std::process::Command;

use crate::subprocess::run_captured;

/// The largest text written, in bytes. A copy past it is refused with an error, never truncated:
/// a half-copied selection would paste as if it were whole. The OSC 52 handler applies the same cap
/// before decoding (`MAX_CLIPBOARD_BYTES` in `osc52.ts`).
pub const MAX_CLIPBOARD_BYTES: usize = 4 * 1024 * 1024;

/// `pbcopy` returns in milliseconds; this bounds a wedged pasteboard server.
const WRITE_TIMEOUT_MS: u64 = 5_000;

const PBCOPY: &str = "/usr/bin/pbcopy";

/// The `pbcopy` invocation: `program` with an explicit UTF-8 locale (see the module header).
fn pbcopy_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.env("LANG", "en_US.UTF-8").env("LC_ALL", "en_US.UTF-8");
    cmd
}

/// Pipe `text` into `program` (normally `pbcopy`) with a UTF-8 locale.
pub fn write_with(program: &Path, text: &str) -> Result<(), String> {
    if text.len() > MAX_CLIPBOARD_BYTES {
        return Err(format!(
            "the copied text is {} bytes, over the {MAX_CLIPBOARD_BYTES}-byte limit",
            text.len()
        ));
    }
    run_captured(pbcopy_command(program), text, WRITE_TIMEOUT_MS)
        .map(|_| ())
        .map_err(|e| format!("could not copy to the clipboard: pbcopy {e}"))
}

/// Put `text` on this Mac's clipboard. `async` + the blocking pool, because it waits on a
/// subprocess (`tests/sync_commands_do_not_block.rs` → `ASYNC_COMMANDS`).
#[tauri::command]
pub async fn clipboard_write(text: String) -> Result<(), String> {
    crate::blocking::on_blocking_worker("the clipboard write", move || {
        write_with(Path::new(PBCOPY), &text)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// A fake `pbcopy` that records its stdin and its locale env.
    fn fake(dir: &Path, exit: i32) -> std::path::PathBuf {
        let p = dir.join("fake-pbcopy");
        std::fs::write(
            &p,
            format!(
                "#!/bin/sh\ncat > '{0}/in'\nprintf '%s|%s' \"$LANG\" \"$LC_ALL\" > '{0}/env'\nexit {exit}\n",
                dir.display()
            ),
        )
        .unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    #[test]
    fn writes_the_exact_utf8_bytes_with_a_utf8_locale() {
        let dir = TempDir::new().unwrap();
        let text = "héllo ✓ — 中文\nline2";
        write_with(&fake(dir.path(), 0), text).unwrap();
        assert_eq!(
            std::fs::read(dir.path().join("in")).unwrap(),
            text.as_bytes()
        );
        assert_eq!(
            std::fs::read_to_string(dir.path().join("env")).unwrap(),
            "en_US.UTF-8|en_US.UTF-8",
            "pbcopy reads MacRoman without a UTF-8 locale"
        );
    }

    /// The locale is set EXPLICITLY on the child, whatever the parent has. A check through the fake
    /// `pbcopy` alone cannot see this: `run_captured` keeps the parent env, and a dev shell (or
    /// `verify:auto`) already exports `LANG=en_US.UTF-8`, while a Finder-launched app does not
    /// (Phase 2 verify-self, P2.vs.2). `get_envs` lists only what was set on the `Command`.
    #[test]
    fn the_pbcopy_command_sets_the_utf8_locale_itself() {
        let cmd = pbcopy_command(Path::new(PBCOPY));
        let envs: Vec<(String, Option<String>)> = cmd
            .get_envs()
            .map(|(k, v)| {
                (
                    k.to_string_lossy().into_owned(),
                    v.map(|v| v.to_string_lossy().into_owned()),
                )
            })
            .collect();
        for key in ["LANG", "LC_ALL"] {
            assert!(
                envs.contains(&(key.to_string(), Some("en_US.UTF-8".to_string()))),
                "{key} not set explicitly: {envs:?}"
            );
        }
        assert_eq!(cmd.get_program(), PBCOPY);
    }

    #[test]
    fn a_failing_pbcopy_is_an_error_not_a_silent_success() {
        let dir = TempDir::new().unwrap();
        let err = write_with(&fake(dir.path(), 3), "x").unwrap_err();
        assert!(err.starts_with("could not copy to the clipboard"), "{err}");
    }

    #[test]
    fn over_the_cap_is_refused_before_anything_runs() {
        let dir = TempDir::new().unwrap();
        let big = "a".repeat(MAX_CLIPBOARD_BYTES + 1);
        let err = write_with(&fake(dir.path(), 0), &big).unwrap_err();
        assert!(err.contains("over the"), "{err}");
        assert!(!dir.path().join("in").exists(), "nothing was spawned");
        // At the cap exactly: written.
        write_with(&fake(dir.path(), 0), &big[1..]).unwrap();
        assert_eq!(
            std::fs::metadata(dir.path().join("in")).unwrap().len() as usize,
            MAX_CLIPBOARD_BYTES
        );
    }
}
