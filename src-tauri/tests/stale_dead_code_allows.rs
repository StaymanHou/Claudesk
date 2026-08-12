//! Guard: no `#[allow(dead_code)]` in this crate may be **stale**.
//!
//! ## The blind spot this closes
//!
//! `SURFACE-2026-08-10-ALLOW-DEAD-CODE-OUTLIVING-ITS-CONSUMER-IS-INVISIBLE-TO-THE-GATE`:
//! `read_default_drive_mode` kept its `#[allow(dead_code)]` for an entire work package *after*
//! its named consumer landed on the CC spawn path. The fn read as "not called yet" while being
//! load-bearing for the whole drive-mode signal.
//!
//! ⚠️ **The ledger's stated close condition — "clippy passes with the attribute absent" — cannot
//! detect this class, by construction.** A stale attribute suppresses precisely the warning that
//! would flag it, so `clippy -D warnings` passes just as happily *with* it present. Nothing
//! fails; the attribute simply misinforms the next reader, and each work package that trusts it
//! inherits a slightly wronger map. The failure direction is **false reassurance**, which is why
//! this test **inverts** the check: an attribute that is no longer needed FAILS the build.
//!
//! ## Why `--force-warn`, and not a grep or a scratch copy
//!
//! ⚠️ **A source-text predicate cannot answer this question.** The obvious implementation — grep
//! each attributed item's name and see whether anything references it — was built and measured
//! **wrong on all nine live attributes** during the 2026-08-12 paydown sweep. A `\bname\b` match
//! cannot tell a **call** from a **mention**: the module header's doc comments name their own
//! functions, and short names (`build`, `family`) collide with unrelated symbols crate-wide.
//! Every one of the nine looked stale; the compiler then confirmed every one was accurate.
//!
//! ⚠️ **The second attempt — copy the crate, strip the attributes, compile the copy — was also
//! wrong, and wrong in the direction this file exists to prevent.** The copy's `build.rs`
//! (`tauri_build::build()`) fails outside the real crate layout, so the compile aborted *before
//! type-checking* and produced no dead-code diagnostics at all — which the guard read as "nothing
//! is dead" and duly reported all nine accurate attributes as stale. **A compile that never ran
//! and a crate with zero dead items are indistinguishable from the absence of diagnostics.**
//!
//! `RUSTFLAGS="--force-warn dead_code"` overrides every `#[allow(dead_code)]` **in place**, so the
//! real tree is compiled, nothing is mutated, and rustc — the only oracle that can tell a call
//! from a mention — reports which items are genuinely dead. Attribute with a diagnostic on the
//! next line ⇒ accurate. Attribute with none ⇒ stale.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

fn crate_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn rust_sources(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            rust_sources(&path, out);
        } else if path.extension().is_some_and(|e| e == "rs") {
            out.push(path);
        }
    }
}

/// `(repo-relative file, 1-indexed line)` of every bare `#[allow(dead_code)]` attribute.
///
/// Matches the attribute alone on its line — the form this crate uses. A doc comment that merely
/// *mentions* it (the ledger blocks in `session_state/mod.rs` and `config_store/mod.rs` are full
/// of them) starts with `//!` or `///`, so `trim() ==` excludes it without a comment-stripper.
fn dead_code_attributes(root: &Path) -> Vec<(String, usize)> {
    let mut files = Vec::new();
    rust_sources(&root.join("src"), &mut files);
    files.sort();

    let mut found = Vec::new();
    for file in files {
        let Ok(text) = std::fs::read_to_string(&file) else {
            continue;
        };
        let rel = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .into_owned();
        for (i, line) in text.lines().enumerate() {
            if line.trim() == "#[allow(dead_code)]" {
                found.push((rel.clone(), i + 1));
            }
        }
    }
    found
}

#[test]
#[ignore = "runs a full cargo check; invoke explicitly in verify-auto"]
fn every_allow_dead_code_is_still_load_bearing() {
    let root = crate_root();
    let attributes = dead_code_attributes(&root);
    if attributes.is_empty() {
        return; // Nothing suppressed; nothing to go stale.
    }

    let out = Command::new(env!("CARGO"))
        .current_dir(&root)
        .args(["check", "--lib", "--message-format=short"])
        .env("RUSTFLAGS", "--force-warn dead_code")
        // A distinct target dir keeps this from invalidating the ordinary build's cache, which
        // is compiled with different RUSTFLAGS and would otherwise be rebuilt on every switch.
        .env("CARGO_TARGET_DIR", root.join("target/force-warn-dead-code"))
        .output()
        .expect("run cargo check with --force-warn dead_code");
    let stderr = String::from_utf8_lossy(&out.stderr);

    // `src/reclassify/mod.rs:102:12: warning: method `meta_i64` is never used`
    // Dependency diagnostics carry an absolute registry path, so a relative prefix excludes them.
    let dead_lines: HashSet<usize> = stderr
        .lines()
        .filter(|l| l.contains("never used") || l.contains("never read"))
        .filter(|l| l.starts_with("src/"))
        .filter_map(|l| l.split(':').nth(1)?.parse::<usize>().ok())
        .collect();

    // ⚠️ POSITIVE CONTROL — prove the compiler actually spoke before believing its silence.
    // Every attribute suppresses something, so a healthy run reports at least one dead item.
    // Zero means the instrument broke (compile aborted, flag ignored, format changed), NOT that
    // the attributes are accurate — the exact confusion that sank the scratch-copy attempt.
    assert!(
        !dead_lines.is_empty(),
        "instrument check failed: `cargo check` with `--force-warn dead_code` reported NO \
         dead-code diagnostics for this crate, which cannot be true while {} \
         `#[allow(dead_code)]` attribute(s) are present. Treat this as the guard being broken, \
         NOT as the attributes being accurate.\n---- cargo output (first 25 lines) ----\n{}",
        attributes.len(),
        stderr.lines().take(25).collect::<Vec<_>>().join("\n")
    );

    // rustc points at the item's own line, which is the attribute's line + 1 in the common case
    // and a little further when doc comments or other attributes sit between. Scan a small
    // window rather than assuming adjacency.
    let stale: Vec<String> = attributes
        .iter()
        .filter(|(_, line)| !(1..=6).any(|off| dead_lines.contains(&(line + off))))
        .map(|(file, line)| format!("{file}:{line}"))
        .collect();

    assert!(
        stale.is_empty(),
        "stale #[allow(dead_code)] — the compiler does NOT report the item below each of these \
         as dead, so it has a real caller and the attribute is now misinforming readers. Delete \
         the attribute (in the same commit as the caller lands, per the ledger discipline):\n  {}",
        stale.join("\n  ")
    );
}
