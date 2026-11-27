//! M17 WP7 — **remote reads** (`arch/remote-workspaces.md` §F): the read-only file access a remote
//! workspace's IN surfaces need (the Docs panel, Recycle's `.session.md` baseline).
//!
//! ## What it is, and what it is not
//! - **Read-only.** Nothing here writes on the remote, and Claudesk still never writes into
//!   `workflow-system/` (arch §F's complete list of remote writes is unchanged).
//! - **Over the host's master, Up-only** ([`crate::remote_link::LinkRegistry::master_exec`]): a read
//!   while the link is down fails fast with [`LINK_DOWN`] and never connects directly.
//! - **Path containment twice.** [`validate_rel`] rejects `..`, absolute, empty and unframeable paths
//!   LOCALLY, before any command string is built (the remote equivalent of `validate_root`). The
//!   remote script then resolves the target with `realpath` and refuses anything that resolves
//!   outside the project, so an in-project symlink pointing out is refused too, as locally.
//! - **Every command string comes from `remote_cmd`** ("no variable value outside `quote`").
//!
//! The commands that route here (`docs_list` / `docs_read` / `docs_stat`) dispatch by target inside
//! the command, once, so the frontend is unchanged.

pub mod poller;

use crate::docs::{filter_listing, DocDirs, DocEntry, ListedFile, DOC_DIRS};
use crate::editor_fs::{EditorFsError, FileMarker};
use crate::remote_cmd::{self, DocReadMode, ValidTarget, FS_SENTINEL};
use crate::remote_link::{CloseExecError, LinkRegistry};
use crate::subprocess::RunError;

/// What a read says when the host's link is not Up (or the master died under it). Plain words: no
/// `ssh:`, no `os error` (spec AC-4). The Docs panel shows it as its reload note.
pub const LINK_DOWN: &str = "The remote host isn't reachable right now.";

/// The largest remote file read as text. ⚠️ Smaller than the local `READ_FILE_MAX_BYTES` (64 MiB):
/// the bytes come back on the exec's stdout, which `run_captured` caps at [`crate::subprocess::CAPTURED_PIPE_MAX`] (4 MiB). A
/// workflow doc is a few hundred KiB at most.
pub const REMOTE_READ_MAX_BYTES: u64 = 3 * 1024 * 1024;

// A read at the limit plus its answer framing must fit one exec's stdout, or it is refused as
// "too large" instead of read. `as u64` is exact: the cap is 4 MiB.
const _: () = assert!(REMOTE_READ_MAX_BYTES < crate::subprocess::CAPTURED_PIPE_MAX as u64);

/// A listing or a stat: one short script.
pub const LIST_TIMEOUT_MS: u64 = crate::remote_link::EXEC_TIMEOUT_MS;

/// A read moves up to [`REMOTE_READ_MAX_BYTES`] over the link.
pub const READ_TIMEOUT_MS: u64 = 30_000;

/// Why a remote read did not answer.
#[derive(Debug, thiserror::Error)]
pub enum RemoteFsError {
    /// The link is not Up, or the master is gone: nothing was read.
    #[error("{}", LINK_DOWN)]
    LinkDown,
    /// The file-level answer, in the SAME words the local read uses for the same case.
    #[error("{0}")]
    Fs(#[from] EditorFsError),
    /// The exec ran but gave no usable answer (a broken remote `perl`, a truncated reply).
    #[error("could not read the remote project: {0}")]
    Failed(String),
}

/// How an exec failed, before any parsing.
#[derive(Debug)]
pub enum ExecFailure {
    LinkDown,
    Failed(String),
}

impl From<ExecFailure> for RemoteFsError {
    fn from(e: ExecFailure) -> Self {
        match e {
            ExecFailure::LinkDown => Self::LinkDown,
            ExecFailure::Failed(s) => Self::Failed(s),
        }
    }
}

/// The one way this module reaches a remote. [`LinkRegistry`] in production; a recording double in
/// tests, so "rejected before any command was built" is observable as zero calls.
pub trait RemoteExec {
    fn run(
        &self,
        target: &ValidTarget,
        remote_command: &str,
        timeout_ms: u64,
    ) -> Result<String, ExecFailure>;
}

impl RemoteExec for LinkRegistry {
    fn run(
        &self,
        target: &ValidTarget,
        remote_command: &str,
        timeout_ms: u64,
    ) -> Result<String, ExecFailure> {
        self.master_exec(target, remote_command, timeout_ms)
            .map_err(classify_exec_error)
    }
}

/// ⚠️ A master that died while the registry still says Up makes the master-only exec fail at once
/// with ssh's own 255 (its `ProxyCommand=/usr/bin/false`), and a dead network makes it time out.
/// Both mean "the host isn't reachable", not "the project is broken", so both read as the link-down
/// words. Anything else is a real failure and keeps its text.
fn classify_exec_error(e: CloseExecError) -> ExecFailure {
    match e {
        CloseExecError::LinkNotUp => ExecFailure::LinkDown,
        CloseExecError::Run(RunError::Failed {
            code: Some(255), ..
        })
        | CloseExecError::Run(RunError::TimedOut(_)) => ExecFailure::LinkDown,
        CloseExecError::Run(other) => ExecFailure::Failed(other.to_string()),
    }
}

/// Validate a project-relative path for a remote read, LOCALLY, before it reaches any command:
/// non-empty, relative, no `..`, no NUL / line break (they could not be framed), `.` and empty
/// segments dropped. Returns the normalized form. The error is the local read's own
/// [`EditorFsError::OutsideWorkspace`], so the two read the same.
pub fn validate_rel(rel: &str, root: &str) -> Result<String, EditorFsError> {
    let outside = || EditorFsError::OutsideWorkspace {
        requested: rel.to_string(),
        root: root.to_string(),
    };
    if rel.starts_with('/') || rel.contains(['\0', '\n', '\r']) {
        return Err(outside());
    }
    let mut parts: Vec<&str> = Vec::new();
    for seg in rel.split('/') {
        match seg {
            "" | "." => {}
            ".." => return Err(outside()),
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        return Err(outside());
    }
    Ok(parts.join("/"))
}

/// Parse a [`remote_cmd::doc_list_command`] answer for `n_roots` roots × `n_dirs` directories into
/// `[root][dir]` file lists. `None` when the answer is not framed by `begin` … `end` (the run failed
/// or was cut), so a failure is never mistaken for an empty project.
pub fn parse_listing(
    out: &str,
    n_roots: usize,
    n_dirs: usize,
) -> Option<Vec<Vec<Vec<ListedFile>>>> {
    let mut grid: Vec<Vec<Vec<ListedFile>>> = vec![vec![Vec::new(); n_dirs]; n_roots];
    let (mut begun, mut ended) = (false, false);
    for line in out.lines() {
        let Some(rest) = line.trim_end_matches('\r').strip_prefix(FS_SENTINEL) else {
            continue;
        };
        match rest {
            "begin" => begun = true,
            "end" if begun => ended = true,
            _ if begun && !ended => {
                let Some(e) = rest.strip_prefix("e\t") else {
                    continue;
                };
                let f: Vec<&str> = e.split('\t').collect();
                let [ri, di, name, kind, size, mtime] = f[..] else {
                    continue;
                };
                let (Ok(ri), Ok(di), Ok(size), Ok(mtime)) = (
                    ri.parse::<usize>(),
                    di.parse::<usize>(),
                    size.parse::<u64>(),
                    mtime.parse::<i64>(),
                ) else {
                    continue;
                };
                if ri >= n_roots || di >= n_dirs || name.is_empty() || !matches!(kind, "f" | "l") {
                    continue;
                }
                grid[ri][di].push(ListedFile {
                    name: name.to_string(),
                    regular: kind == "f",
                    size,
                    mtime_ms: mtime.max(0) as f64,
                });
            }
            _ => {}
        }
    }
    ended.then_some(grid)
}

/// A project's three doc directories, from one root's slice of a parsed listing.
pub fn doc_dirs(mut dirs: Vec<Vec<ListedFile>>) -> DocDirs {
    dirs.resize(DOC_DIRS.len(), Vec::new());
    let mut it = dirs.into_iter();
    DocDirs {
        product: it.next().unwrap_or_default(),
        state: it.next().unwrap_or_default(),
        wip: it.next().unwrap_or_default(),
    }
}

/// The Docs panel's list for a remote project: one exec, then `docs::discover`'s own rules.
pub fn list_docs(
    exec: &dyn RemoteExec,
    target: &ValidTarget,
) -> Result<Vec<DocEntry>, RemoteFsError> {
    let out = exec.run(
        target,
        &remote_cmd::doc_list_command(&DOC_DIRS, &[target.path()]),
        LIST_TIMEOUT_MS,
    )?;
    let mut grid = parse_listing(&out, 1, DOC_DIRS.len())
        .ok_or_else(|| RemoteFsError::Failed("the listing was incomplete".into()))?;
    Ok(filter_listing(&doc_dirs(grid.remove(0))))
}

/// Read one remote file's text (`rel` under the project), refusing what the local read refuses.
pub fn read_doc(
    exec: &dyn RemoteExec,
    target: &ValidTarget,
    rel: &str,
) -> Result<String, RemoteFsError> {
    let rel = validate_rel(rel, target.path())?;
    let out = exec.run(
        target,
        &remote_cmd::doc_read_command(
            DocReadMode::Read,
            target.path(),
            &rel,
            REMOTE_READ_MAX_BYTES,
        ),
        READ_TIMEOUT_MS,
    )?;
    match parse_answer(&out, DocReadMode::Read, &rel, target.path())? {
        Answer::Text(t) => Ok(t),
        Answer::Marker(_) => Err(RemoteFsError::Failed("a stat answer to a read".into())),
    }
}

/// Stat one remote file (`rel` under the project): Recycle's `.session.md` baseline.
pub fn stat_doc(
    exec: &dyn RemoteExec,
    target: &ValidTarget,
    rel: &str,
) -> Result<FileMarker, RemoteFsError> {
    let rel = validate_rel(rel, target.path())?;
    let out = exec.run(
        target,
        &remote_cmd::doc_read_command(DocReadMode::Stat, target.path(), &rel, 0),
        LIST_TIMEOUT_MS,
    )?;
    match parse_answer(&out, DocReadMode::Stat, &rel, target.path())? {
        Answer::Marker(m) => Ok(m),
        Answer::Text(_) => Err(RemoteFsError::Failed("a read answer to a stat".into())),
    }
}

/// A parsed single-file answer.
#[derive(Debug, PartialEq)]
pub enum Answer {
    Text(String),
    Marker(FileMarker),
}

/// Parse a [`remote_cmd::doc_read_command`] answer. The FIRST status line wins (rc-file noise comes
/// before it); a read's text is every byte after that line, and must be exactly the length it
/// announced (a cut reply is a failure, never a shorter document).
pub fn parse_answer(
    out: &str,
    mode: DocReadMode,
    rel: &str,
    root: &str,
) -> Result<Answer, RemoteFsError> {
    let prefix = format!(
        "{FS_SENTINEL}{}:",
        match mode {
            DocReadMode::Read => "read",
            DocReadMode::Stat => "stat",
        }
    );
    let mut offset = 0usize;
    for line in out.split_inclusive('\n') {
        offset += line.len();
        let Some(status) = line.trim_end_matches(['\n', '\r']).strip_prefix(&prefix) else {
            continue;
        };
        let io = |kind: std::io::ErrorKind, msg: String| {
            RemoteFsError::Fs(EditorFsError::Io(std::io::Error::new(kind, msg)))
        };
        return match status.split(':').collect::<Vec<_>>()[..] {
            ["missing"] => Err(io(
                std::io::ErrorKind::NotFound,
                format!("no such file: {rel}"),
            )),
            ["outside"] => Err(EditorFsError::OutsideWorkspace {
                requested: rel.to_string(),
                root: root.to_string(),
            }
            .into()),
            ["notfile"] => Err(EditorFsError::NotAFile(rel.to_string()).into()),
            ["notutf8"] => Err(EditorFsError::NotUtf8(rel.to_string()).into()),
            ["unreadable"] => Err(io(
                std::io::ErrorKind::Other,
                format!("could not read {rel}"),
            )),
            ["toolarge", size] => Err(EditorFsError::TooLarge {
                path: rel.to_string(),
                size: size.parse().unwrap_or(0),
                limit: REMOTE_READ_MAX_BYTES,
            }
            .into()),
            ["ok", size, mtime] if mode == DocReadMode::Stat => {
                match (size.parse::<u64>(), mtime.parse::<i64>()) {
                    (Ok(size), Ok(m)) => Ok(Answer::Marker(FileMarker {
                        mtime_ms: m.max(0) as f64,
                        size,
                    })),
                    _ => Err(RemoteFsError::Failed(format!("a malformed stat: {status}"))),
                }
            }
            ["ok", len] if mode == DocReadMode::Read => {
                let len: usize = len
                    .parse()
                    .map_err(|_| RemoteFsError::Failed(format!("a malformed read: {status}")))?;
                let text = &out[offset..];
                if text.len() != len {
                    return Err(RemoteFsError::Failed(format!(
                        "the reply was cut ({} of {len} bytes)",
                        text.len()
                    )));
                }
                Ok(Answer::Text(text.to_string()))
            }
            _ => Err(RemoteFsError::Failed(format!(
                "an unknown answer: {status}"
            ))),
        };
    }
    Err(RemoteFsError::Failed("no answer".into()))
}

#[cfg(test)]
pub(crate) mod tests;
