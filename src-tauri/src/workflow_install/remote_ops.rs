//! M18 WP7 — Uninstall (and, from Phase 3, Update) of the workflow system on a REMOTE host account,
//! over the host's ControlMaster (`arch/claude-substrate.md` §R.3). The install's sibling:
//! [`super::remote_runner`] builds the install script; this module builds the scripts that act on
//! a Managed install. Pure builders, parsers and reducers; the commands layer runs them.
//!
//! ## Uninstall, in order
//! 1. **Observe** ([`observe_script`], read-only, run twice by [`observe_and_guard`]): the host's
//!    record (hex) and the physical forms of the root, the account's `$HOME`, both `.claude`s, and
//!    the record's clone path. The first read finds the record; the second resolves its clone path
//!    and re-reads the record, which must not have changed in between.
//! 2. **Guard** ([`super::remote_guard::remote_refuse_guard`]): the only way to a
//!    [`RemoteUninstallTarget`].
//! 3. **Preview** ([`dry_run_script`]): the host's own `uninstall.sh --dry-run` in the approved clone.
//! 4. **Run** ([`uninstall_script`]), built from the approved target ONLY. On the host, under
//!    `trap '' HUP PIPE TERM INT` from its first line (no Cancel: the run takes well under a second
//!    and must not be split, WP7 D7):
//!    - the host RE-CHECKS (D6): the record's bytes are still the ones the guard saw, and the clone
//!      path is still a real folder whose physical path is exactly the approved one, still holding
//!      `uninstall.sh`; else `result:changed` and nothing is touched;
//!    - `uninstall.sh` with `HOME=<root>`, run as a DIRECT child (never inside `( … )`: zsh resets
//!      an ignored trap in a subshell, WP7 Phase 1), output to a log;
//!    - only when it exits 0: `rm -rf` of the approved path, then the record deleted LAST. A
//!      failure at any step keeps the record, so the host still reads Managed and Uninstall can be
//!      retried.
//!
//! Every value enters a script quoted ([`crate::remote_cmd::quote`]).

use super::guard::RefusalReason;
use super::provenance::{self, InstallRecord, RECORD_FILENAME};
use super::remote_guard::{remote_refuse_guard, HostObservation, RemoteUninstallTarget};
use super::remote_runner::{fill, valid_root, RemoteOp, RemoteRunFinished, RUN_SENTINEL};
use super::DEFAULT_VENDOR_SUBPATH;
use crate::remote_cmd::{decode_hex, quote};
use crate::remote_substrate::HostSubstrate;

/// The prefix of an observation line.
pub const OBS_SENTINEL: &str = "CLAUDESK-OBS:";

/// The record's path under a root, as the run scripts name it.
fn record_path(root: &str) -> String {
    format!("{root}/{}/{RECORD_FILENAME}", DEFAULT_VENDOR_SUBPATH[0])
}

/// The observe script: one `perl` (already a dependency of the substrate probe), read-only. Prints
/// every fact as hex (`-` when absent), so a path with a newline cannot forge a line. `clone` is
/// the record's clone path, or `None` for the first read (record only).
pub fn observe_script(root: &str, clone: Option<&str>) -> Result<String, String> {
    if !valid_root(root) {
        return Err(format!(
            "the host's install root {root:?} is not an absolute, normalized path"
        ));
    }
    Ok(format!(
        "perl -MCwd=abs_path -e '{OBSERVE_PERL}' -- {} {} {}",
        quote(root),
        quote(clone.unwrap_or("")),
        quote(&record_path(root))
    ))
}

/// The observe script's perl. `-e` is false for a dangling link, so a link to nowhere reads as
/// unresolvable; `abs_path` resolves files and folders alike, as the local guard's
/// `canonicalize`. ⚠️ No single quote may appear in it (it is wrapped in one).
const OBSERVE_PERL: &str = r#"
my ($root, $clone, $recp) = @ARGV;
sub h { defined $_[0] ? unpack("H*", $_[0]) : "-" }
sub r { my $p = shift; (defined $p && length $p && -e $p) ? abs_path($p) : undef }
print "CLAUDESK-OBS:root:", h(r($root)), "\n";
print "CLAUDESK-OBS:root-claude:", h(r("$root/.claude")), "\n";
print "CLAUDESK-OBS:home:", h(r($ENV{HOME})), "\n";
print "CLAUDESK-OBS:home-claude:", h(r("$ENV{HOME}/.claude")), "\n";
my $t = r($clone);
print "CLAUDESK-OBS:target:", h($t), "\n";
print "CLAUDESK-OBS:target-dir:", (defined $t && -d $t ? 1 : 0), "\n";
print "CLAUDESK-OBS:target-uninstall:", (defined $t && -f "$t/uninstall.sh" ? 1 : 0), "\n";
my $x;
if (open(my $f, "<", $recp)) { local $/; $x = <$f>; $x = "" unless defined $x }
print "CLAUDESK-OBS:record:", h($x), "\n";
"#;

/// An observation's text field: `-` → `None`, hex → the UTF-8 text, anything else → `Err` (the
/// whole observation is then unreadable).
fn text(v: &str) -> Result<Option<String>, ()> {
    if v == "-" {
        return Ok(None);
    }
    let bytes = decode_hex(v).ok_or(())?;
    String::from_utf8(bytes).map(Some).map_err(|_| ())
}

/// The observe script's output → a [`HostObservation`], or `None` when any line is missing or
/// malformed, or the root or the home did not resolve (an observation that cannot be read
/// approves nothing).
pub fn parse_observation(out: &str) -> Option<HostObservation> {
    let field = |key: &str| {
        out.lines().find_map(|l| {
            l.trim()
                .strip_prefix(OBS_SENTINEL)?
                .strip_prefix(key)?
                .strip_prefix(':')
                .map(str::to_string)
        })
    };
    let flag = |key: &str| match field(key).as_deref() {
        Some("1") => Some(true),
        Some("0") => Some(false),
        _ => None,
    };
    let record_hex = field("record")?;
    if record_hex != "-" && decode_hex(&record_hex).is_none() {
        return None;
    }
    Some(HostObservation {
        root: text(&field("root")?).ok()??,
        root_claude: text(&field("root-claude")?).ok()?,
        home: text(&field("home")?).ok()??,
        home_claude: text(&field("home-claude")?).ok()?,
        target: text(&field("target")?).ok()?,
        target_is_dir: flag("target-dir")?,
        has_uninstall: flag("target-uninstall")?,
        record_hex,
    })
}

/// The record an observation read, parsed by the local parser: absent, malformed and the wrong
/// shape all collapse to `None` (the guard's no-record arm).
pub fn record_of(obs: &HostObservation) -> Option<InstallRecord> {
    decode_hex(&obs.record_hex).and_then(|b| provenance::parse_record(&b))
}

/// Observe the host twice and run the guard. `exec` runs one script on the host (production: over
/// the master under a login shell; tests: `/bin/zsh -c`) and returns its stdout. `Err` is plain
/// words for the operator, and means nothing was approved.
pub fn observe_and_guard(
    root: &str,
    exec: &dyn Fn(&str) -> Result<String, String>,
) -> Result<RemoteUninstallTarget, String> {
    let unreadable = "Claudesk couldn't read the host's install state. Nothing was changed.";
    let first = parse_observation(&exec(&observe_script(root, None)?)?)
        .ok_or_else(|| unreadable.to_string())?;
    let Some(record) = record_of(&first) else {
        return Err(RefusalReason::NoRecord.user_message());
    };
    let clone = record.clone_path.to_string_lossy().into_owned();
    let second = parse_observation(&exec(&observe_script(root, Some(&clone))?)?)
        .ok_or_else(|| unreadable.to_string())?;
    if second.record_hex != first.record_hex {
        return Err(
            "The install record on the host changed while Claudesk was checking it. Nothing was \
             changed; reopen Settings and try again."
                .to_string(),
        );
    }
    remote_refuse_guard(Some(&record), &second).map_err(|r| r.user_message())
}

/// The preview: the host's own `uninstall.sh --dry-run` in the approved clone. Read-only (WP3
/// "Probe outcomes" (3): it changes nothing).
pub fn dry_run_script(target: &RemoteUninstallTarget) -> String {
    format!(
        "cd -- {} && HOME={} ./uninstall.sh --dry-run </dev/null 2>&1",
        quote(target.clone_dir()),
        quote(target.root())
    )
}

/// The uninstall script's text, placeholders still in it ([`uninstall_script`] fills them).
/// Every refusal touches nothing; the record goes LAST.
const UNINSTALL_TEMPLATE: &str = r#"trap '' HUP PIPE TERM INT
root=__ROOT__
target=__TARGET__
want=__RECHEX__
rec=__REC__
log="$root/__DOTDIR__/uninstall.log"
now=$(perl -e 'my $x; if (open(my $f, "<", $ARGV[0])) { local $/; $x = <$f>; $x = "" unless defined $x; print unpack("H*", $x) } else { print "-" }' -- "$rec")
if [ "$now" != "$want" ]; then echo 'CLAUDESK-RUN:result:changed'; exit 0; fi
if [ -L "$target" ] || [ ! -d "$target" ] || [ ! -f "$target/uninstall.sh" ]; then echo 'CLAUDESK-RUN:result:changed'; exit 0; fi
cp=$(cd -P -- "$target" 2>/dev/null && pwd -P)
if [ "$cp" != "$target" ]; then echo 'CLAUDESK-RUN:result:changed'; exit 0; fi
echo 'Running uninstall.sh on the host.'
cd -- "$target" && HOME="$root" ./uninstall.sh </dev/null >"$log" 2>&1
urc=$?
cd -- "$root" || cd /
r=ok
if [ "$urc" -eq 0 ]; then
  rm -rf -- "$target"
  if [ -e "$target" ] || [ -L "$target" ]; then r=rm-failed
  else
    rm -f -- "$rec"
    if [ -e "$rec" ] || [ -L "$rec" ]; then r=record-failed; fi
  fi
fi
cat -- "$log"
if [ "$urc" -ne 0 ]; then echo "CLAUDESK-RUN:result:uninstall-failed:$urc"
else echo "CLAUDESK-RUN:result:$r"; fi"#;

/// The uninstall script for an approved target. ⚠️ Its ONLY input is the
/// [`RemoteUninstallTarget`]: the root, the clone and the record's expected bytes all come from
/// the guard, so the `rm -rf` in it can only ever name a path the guard approved
/// (`remote_ops_tests::the_deleting_builders_take_only_an_approved_target` pins the signature).
pub fn uninstall_script(target: &RemoteUninstallTarget) -> String {
    // The values are guard outputs: a root `valid_root` would refuse cannot reach here (the
    // observe script refused it), but a fill error still yields a script that does nothing.
    fill(
        UNINSTALL_TEMPLATE,
        &[
            ("__ROOT__", &quote(target.root())),
            ("__TARGET__", &quote(target.clone_dir())),
            ("__RECHEX__", &quote(target.record_hex())),
            ("__REC__", &quote(&record_path(target.root()))),
            ("__DOTDIR__", DEFAULT_VENDOR_SUBPATH[0]),
        ],
    )
    .unwrap_or_else(|_| "echo 'CLAUDESK-RUN:result:changed'".to_string())
}

/// How an uninstall run ended, as it reported it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UninstallResult {
    Ok,
    /// The host's record or clone folder is not what the guard approved. Nothing was touched.
    Changed,
    /// `uninstall.sh` exited non-zero. The clone and the record were kept.
    UninstallFailed(i32),
    /// The links went, but the clone folder could not be removed. The record was kept.
    RmFailed,
    /// Everything went but the record, which could not be deleted.
    RecordDeleteFailed,
}

/// One uninstall output line: `Some` for a result sentinel, `None` for the operator's output.
pub fn parse_uninstall_line(line: &str) -> Option<UninstallResult> {
    let r = line
        .trim()
        .strip_prefix(RUN_SENTINEL)?
        .strip_prefix("result:")?;
    Some(match r {
        "ok" => UninstallResult::Ok,
        "changed" => UninstallResult::Changed,
        "rm-failed" => UninstallResult::RmFailed,
        "record-failed" => UninstallResult::RecordDeleteFailed,
        _ => UninstallResult::UninstallFailed(r.strip_prefix("uninstall-failed:")?.parse().ok()?),
    })
}

/// The host's state after a run, in a phrase.
fn state_words(after: Option<&HostSubstrate>) -> &'static str {
    match after {
        Some(HostSubstrate::Managed { .. }) => "installed by Claudesk (Managed)",
        Some(HostSubstrate::Developer { .. }) => {
            "Developer (installed, but with no Claudesk record)"
        }
        Some(HostSubstrate::Absent) => "Absent (nothing installed)",
        Some(HostSubstrate::Unknown) | None => "unknown: Claudesk couldn't re-check it",
    }
}

/// The ending of an uninstall → what it means. Pure. As for the install, **the re-probe (`after`)
/// is the authority** on the host's state: `ok` only when the host reads Absent (or could not be
/// re-checked after a reported success). Every arm is written out.
pub fn resolve_uninstall(
    host: &str,
    result: Option<&UninstallResult>,
    exit: i32,
    after: Option<&HostSubstrate>,
) -> RemoteRunFinished {
    let absent = after == Some(&HostSubstrate::Absent);
    let done = |ok: bool, message: Option<String>| RemoteRunFinished {
        host: host.to_string(),
        op: RemoteOp::Uninstall,
        ok,
        cancelled: false,
        message,
    };
    let retry = "The install record was kept, so Uninstall can be retried.";
    match result {
        Some(UninstallResult::Ok) if absent => done(true, None),
        Some(UninstallResult::Ok) if after.is_none() || after == Some(&HostSubstrate::Unknown) => {
            done(
                true,
                Some(
                    "Uninstalled. Claudesk couldn't re-check the host afterwards; reopen \
                     Settings to refresh it."
                        .to_string(),
                ),
            )
        }
        Some(UninstallResult::Ok) => done(
            false,
            Some(format!(
                "uninstall.sh finished and the clone was removed, but the host now reads as {}.",
                state_words(after)
            )),
        ),
        Some(UninstallResult::Changed) => done(
            false,
            Some(
                "The host changed after Claudesk checked it: the install record or the clone \
                 folder is not what was approved. Nothing was removed; reopen Settings and try \
                 again."
                    .to_string(),
            ),
        ),
        Some(UninstallResult::UninstallFailed(code)) => done(
            false,
            Some(format!(
                "uninstall.sh failed (exit {code}); its output is above. The clone folder was \
                 not removed. {retry}"
            )),
        ),
        Some(UninstallResult::RmFailed) => done(
            false,
            Some(format!(
                "uninstall.sh removed the links, but the clone folder could not be removed. \
                 {retry}"
            )),
        ),
        Some(UninstallResult::RecordDeleteFailed) => done(
            absent,
            Some(format!(
                "Everything was removed except the install record, which could not be deleted. \
                 The host now reads as {}.",
                state_words(after)
            )),
        ),
        None => done(
            absent,
            Some(format!(
                "The run ended without reporting a result (exit {exit}). The host now reads as \
                 {}.",
                state_words(after)
            )),
        ),
    }
}

#[cfg(test)]
#[path = "remote_ops_tests.rs"]
mod tests;
