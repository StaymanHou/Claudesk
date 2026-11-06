//! Editor file IO — read/write a file inside a workspace's project directory.
//!
//! Backs the Milestone-2 lite editor (WP2). The editor opens and saves files that
//! live under a workspace's project root; this module is the only filesystem path
//! for that. We use a dedicated Rust module rather than `tauri-plugin-fs` so the
//! IO follows the repo's `command → pure-fn → typed-error → String` convention
//! (cf. [`crate::config_store`]) and so every failure is surfaced explicitly
//! across IPC (the WP6/WP7 error-surfacing lesson) instead of swallowed.
//!
//! ## Layout
//! - **Pure core** ([`read_file_core`], [`write_file_core`]) takes an injected
//!   `root: &Path` (the workspace project dir) plus the requested file path, so it
//!   is unit-testable against a `TempDir` with no Tauri runtime.
//! - **Tauri command wrappers** ([`commands`]) are the only IPC surface; they map
//!   [`EditorFsError`] to a `String`.
//!
//! ## Safety: the workspace-root guard (WP7 — fully enforced)
//! Two layers, both enforced in the backend:
//! 1. **`root` is authenticated, not trusted.** `root` arrives from the frontend, but
//!    the command layer ([`commands`]) validates it against the known project list via
//!    [`validate_root`] before honoring it — a `root` that is neither a known project
//!    nor a descendant of one is rejected. So the renderer can't widen the guard by
//!    passing an arbitrary `root`.
//! 2. **The file path is confined to `root`.** A path escaping the workspace via `..`
//!    or an absolute path elsewhere is rejected with [`EditorFsError::OutsideWorkspace`].
//!    Symlinks are fully handled: [`resolve_within`] canonicalizes the target's parent
//!    (catching a symlinked **directory** component) AND, when the target exists,
//!    canonicalizes the full resolved path (catching a **leaf** symlink whose target
//!    points outside root). A not-yet-existing leaf (the write path for a new file) is
//!    safe: it can't be a symlink and its parent is already confirmed inside root.
//!
//! Together these make "the editor only ever touches files inside a known open project"
//! an enforced invariant for both the path-traversal and root-spoofing classes, not a
//! convention. (`resolve_within_lexical` backs only the create paths — see its doc.)
//!
//! ## Durability
//! Writes are atomic: `contents → <file>.tmp → fs::rename`, matching
//! [`crate::config_store`]. A crash mid-write leaves the existing file untouched.

pub mod commands;

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use thiserror::Error;

/// A file's on-disk state marker, used by the WP12 tab strip to detect a file that
/// changed on disk (e.g. Claude Code edited it) since the tab loaded it. We compare
/// `mtime_ms` + `size` for equality on tab-activate and before save — a change in
/// either means the disk copy differs. No content hash (it would cost a full read on
/// every activation); for a single-user local tool whose external writer is CC, a
/// same-mtime+same-size silent edit is a non-case. `mtime_ms` is f64 ms-since-epoch
/// (avoids `SystemTime` serde-shape friction); the frontend only ever compares
/// markers for equality, never interprets the absolute value.
///
/// snake_case end-to-end — Tauri does NOT camelCase command return values, so the TS
/// mirror must read `mtime_ms` / `size` verbatim (the WP7 IPC-DTO-field-case lesson).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct FileMarker {
    /// Modification time as milliseconds since the Unix epoch.
    pub mtime_ms: f64,
    /// File size in bytes.
    pub size: u64,
}

/// Errors from editor file IO. IPC-facing wrappers map this to a `String`.
#[derive(Debug, Error)]
pub enum EditorFsError {
    #[error("file I/O error: {0}")]
    Io(#[from] std::io::Error),
    // ⚠️ The leading text of this message and of `TooLarge`'s is a CONTRACT: the frontend routes
    // these two to the media info card by prefix (`classifyReadError`). Both sides read the prefixes
    // from `src/components/workspace/editor/readErrorPrefixes.json`; the tests below pin it.
    #[error("file is not valid UTF-8 text: {0}")]
    NotUtf8(String),
    /// M16 WP2: the file is larger than [`READ_FILE_MAX_BYTES`], so it is refused before it is read.
    #[error("file is too large to open as text: {path} ({size} bytes; limit {limit})")]
    TooLarge { path: String, size: u64, limit: u64 },
    #[error("path {requested} is outside the workspace root {root}")]
    OutsideWorkspace { requested: String, root: String },
    /// The frontend-supplied `root` is neither a known project nor a descendant of one. Distinct
    /// from [`Self::OutsideWorkspace`], which is a path escaping a root that IS valid.
    #[error("root {0} is not a known project")]
    UnknownRoot(String),
    #[error("path {0} is a directory; recursive directory delete is not supported")]
    IsDirectory(String),
    /// M16 WP2 — a file-only command (`stat_media`, `open_in_default_app`) was given a directory.
    /// Distinct from [`Self::IsDirectory`], whose message is about delete.
    #[error("path {0} is a directory, not a file")]
    NotAFile(String),
    #[error("could not move {path} to Trash: {source}")]
    Trash { path: String, source: trash::Error },
}

/// Resolve `requested` against `root` and confirm the result stays inside `root`.
///
/// Returns the path to operate on (absolute). The containment check is the
/// security boundary, enforced in two steps:
/// 1. Canonicalize `root` (it must exist) and the *parent* of the resolved target
///    (for a not-yet-existing file on write, the file itself may not exist but its
///    directory must), then assert the parent is `root` or a descendant. Canonicalizing
///    the parent resolves `..` and any symlinked **directory** component, so a non-leaf
///    symlink escaping `root` is rejected.
/// 2. Re-attach the raw leaf name. If the resolved target **exists**, canonicalize the
///    full path — which follows a **leaf** symlink to its ultimate target — and re-assert
///    `starts_with(root_canon)`, so a leaf symlink pointing outside `root` is rejected
///    too (WP7). A not-yet-existing target (the new-file write path) is returned as-is:
///    it can't be a symlink, and its parent is already confirmed inside `root`.
fn resolve_within(root: &Path, requested: &Path) -> Result<PathBuf, EditorFsError> {
    let root_canon = root.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(e.kind(), format!("root {root:?}: {e}")))
    })?;

    // The absolute target before canonicalization: absolute requested paths are
    // honored as-is; relative ones join onto root.
    let joined = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root_canon.join(requested)
    };

    // Canonicalize the directory that will hold the file (it must exist for both
    // read and write — write to a missing dir is an error anyway). The filename
    // is re-attached afterwards so a not-yet-existing file is allowed on write.
    let file_name = joined
        .file_name()
        .ok_or_else(|| EditorFsError::OutsideWorkspace {
            requested: requested.display().to_string(),
            root: root.display().to_string(),
        })?;
    let parent = joined.parent().unwrap_or(&root_canon);
    let parent_canon = parent.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(
            e.kind(),
            format!("parent dir {parent:?}: {e}"),
        ))
    })?;

    if !parent_canon.starts_with(&root_canon) {
        return Err(EditorFsError::OutsideWorkspace {
            requested: requested.display().to_string(),
            root: root.display().to_string(),
        });
    }
    let resolved = parent_canon.join(file_name);

    // Leaf-symlink guard: canonicalizing the parent resolves symlinked *directory*
    // components, but the raw leaf is re-attached un-canonicalized, so a **leaf**
    // symlink whose target points outside `root` would otherwise be followed. If the
    // resolved target already exists, canonicalize the full path (which resolves a leaf
    // symlink to its ultimate target) and re-assert containment. A not-yet-existing
    // target (the write path for a new file) is left as-is: it cannot be a symlink, and
    // its parent is already confirmed inside `root` above.
    // The `exists()` → `canonicalize()` gap is not a TOCTOU hole: a swap to a symlink in between
    // is re-checked by `canonicalize` + `starts_with` below, and a dangling one falls to the
    // not-yet-existing path, whose parent is already confirmed inside `root`.
    if resolved.exists() {
        let target_canon = resolved.canonicalize().map_err(|e| {
            EditorFsError::Io(std::io::Error::new(
                e.kind(),
                format!("target {resolved:?}: {e}"),
            ))
        })?;
        if !target_canon.starts_with(&root_canon) {
            return Err(EditorFsError::OutsideWorkspace {
                requested: requested.display().to_string(),
                root: root.display().to_string(),
            });
        }
        return Ok(target_canon);
    }
    Ok(resolved)
}

/// Validate that a frontend-supplied workspace `root` is one of the known projects
/// (or a descendant of one) before any file op honors it.
///
/// The [`resolve_within`] guard confines a *file path* to a given `root`, but `root`
/// itself arrives from the renderer. This authenticates `root` against the known
/// project list (the backend's server-side source of truth — [`crate::config_store`]),
/// so a malformed or hostile `root` can't widen the guard to arbitrary disk. Returns
/// the canonicalized `root` on success (so the caller confines against the resolved
/// form), or [`EditorFsError::UnknownRoot`] if it matches no known project.
///
/// A descendant of a known project is accepted (the editor may open a file via a
/// nested workspace dir under a recorded project). Both sides are canonicalized before
/// comparison so a symlinked or `..`-laden `root` can't spoof a match. `known_roots`
/// entries that no longer exist on disk are skipped (a stale project record can't
/// authorize anything); if `requested_root` itself can't be canonicalized (does not
/// exist), that surfaces as the `Io` error from canonicalize.
pub fn validate_root(
    known_roots: &[PathBuf],
    requested_root: &Path,
) -> Result<PathBuf, EditorFsError> {
    let requested_canon = requested_root.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(
            e.kind(),
            format!("root {requested_root:?}: {e}"),
        ))
    })?;

    let is_known = known_roots.iter().any(|known| {
        // A stale record whose dir was deleted can't authorize anything → skip it.
        match known.canonicalize() {
            Ok(known_canon) => requested_canon.starts_with(&known_canon),
            Err(_) => false,
        }
    });

    if is_known {
        Ok(requested_canon)
    } else {
        Err(EditorFsError::UnknownRoot(
            requested_root.display().to_string(),
        ))
    }
}

/// Resolve `requested` against `root` and confirm containment **lexically** — WITHOUT
/// requiring the target or its parent to already exist (QoL-WP5b).
///
/// [`resolve_within`] canonicalizes the target's parent, so it can only validate a path
/// whose parent dir is already on disk. Creating a new (possibly nested) directory needs
/// to validate `a/b/c` where `a/b` does not exist yet — canonicalizing its parent would
/// fail. This resolver instead normalizes `.`/`..`/empty components purely in memory and
/// asserts the result stays under the canonicalized `root`. A leading `..` that would
/// climb above root (or an absolute path pointing elsewhere) is rejected.
///
/// Safety note: this is used ONLY for the create paths (`create_dir_all` + write-into-a-
/// to-be-created-nested-dir). `create_dir_all` does not follow a symlink to write outside
/// a lexically-contained path, and the read/write/delete primitives keep the stricter
/// canonicalizing [`resolve_within`] — so the symlink-traversal class those guard against
/// is unchanged. Returns the absolute, lexically-normalized target path.
fn resolve_within_lexical(root: &Path, requested: &Path) -> Result<PathBuf, EditorFsError> {
    use std::path::Component;

    let root_canon = root.canonicalize().map_err(|e| {
        EditorFsError::Io(std::io::Error::new(e.kind(), format!("root {root:?}: {e}")))
    })?;

    let joined = if requested.is_absolute() {
        requested.to_path_buf()
    } else {
        root_canon.join(requested)
    };

    // Normalize purely in memory: resolve `.` (skip) and `..` (pop), keep normal segments.
    // A `..` that would pop above the accumulated path is an escape attempt → reject.
    let mut normalized = PathBuf::new();
    for comp in joined.components() {
        match comp {
            Component::Prefix(p) => normalized.push(p.as_os_str()),
            Component::RootDir => normalized.push(Component::RootDir.as_os_str()),
            Component::CurDir => {}
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(EditorFsError::OutsideWorkspace {
                        requested: requested.display().to_string(),
                        root: root.display().to_string(),
                    });
                }
            }
            Component::Normal(seg) => normalized.push(seg),
        }
    }

    if !normalized.starts_with(&root_canon) {
        return Err(EditorFsError::OutsideWorkspace {
            requested: requested.display().to_string(),
            root: root.display().to_string(),
        });
    }
    Ok(normalized)
}

/// The largest file [`read_file_core`] will read as text (M16 WP2, assumption A-1). Real text
/// files in the operator's projects reach ~45 MB, so the cap sits above them; its job is huge
/// text, while [`SNIFF_BYTES`] is what keeps a large *binary* out of memory.
pub const READ_FILE_MAX_BYTES: u64 = 64 * 1024 * 1024;

/// How much of a file is read first to look for a NUL byte, the binary tell.
const SNIFF_BYTES: u64 = 8 * 1024;

/// Read a UTF-8 text file under `root`. Rejects paths escaping the workspace, files over
/// [`READ_FILE_MAX_BYTES`], and non-UTF-8 (binary) content with typed errors.
///
/// Order: stat → size cap → read the first [`SNIFF_BYTES`] and refuse a NUL → read the rest from
/// the SAME handle, bounded by the cap (so a file that grows after the stat is still refused).
/// A binary is therefore refused after at most 8 KiB of IO, never after a full read.
pub fn read_file_core(root: &Path, requested: &Path) -> Result<String, EditorFsError> {
    use std::io::Read;

    let target = resolve_within(root, requested)?;
    let too_large = |size: u64| EditorFsError::TooLarge {
        path: target.display().to_string(),
        size,
        limit: READ_FILE_MAX_BYTES,
    };
    let size = std::fs::metadata(&target)?.len();
    if size > READ_FILE_MAX_BYTES {
        return Err(too_large(size));
    }

    let mut file = std::fs::File::open(&target)?;
    let mut bytes = Vec::with_capacity(size as usize);
    (&mut file).take(SNIFF_BYTES).read_to_end(&mut bytes)?;
    if bytes.contains(&0) {
        return Err(EditorFsError::NotUtf8(format!(
            "{} (binary: NUL byte in the first {SNIFF_BYTES} bytes)",
            target.display()
        )));
    }
    let head = bytes.len() as u64;
    file.take(READ_FILE_MAX_BYTES + 1 - head)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > READ_FILE_MAX_BYTES {
        return Err(too_large(bytes.len() as u64));
    }
    String::from_utf8(bytes)
        .map_err(|e| EditorFsError::NotUtf8(format!("{} ({e})", target.display())))
}

/// Atomically write `contents` to a file under `root`: write `<file>.tmp` then
/// `rename` over the target. Rejects paths escaping the workspace. The target's
/// parent directory must already exist.
pub fn write_file_core(root: &Path, requested: &Path, contents: &str) -> Result<(), EditorFsError> {
    let target = resolve_within(root, requested)?;
    let mut tmp = target.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, contents.as_bytes())?;
    std::fs::rename(&tmp, &target)?;
    Ok(())
}

/// Read a file's [`FileMarker`] (mtime + size) under `root`. Rejects paths escaping
/// the workspace; a missing file is an [`EditorFsError::Io`] (so the frontend treats
/// "can't stat" as a real error, not silently as "unchanged"). Does NOT read the
/// file contents — just `metadata`, so it is cheap to call on every tab activation.
pub fn stat_file_core(root: &Path, requested: &Path) -> Result<FileMarker, EditorFsError> {
    let target = resolve_within(root, requested)?;
    let meta = std::fs::metadata(&target)?;
    Ok(FileMarker {
        mtime_ms: mtime_ms_of(&meta)?,
        size: meta.len(),
    })
}

/// mtime → ms since the Unix epoch. A clock-before-epoch mtime (shouldn't happen on a real
/// file) yields a negative duration; its magnitude becomes negative ms, so the value is still a
/// well-defined comparable number rather than an error.
fn mtime_ms_of(meta: &std::fs::Metadata) -> std::io::Result<f64> {
    Ok(match meta.modified()?.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs_f64() * 1000.0,
        Err(e) => -(e.duration().as_secs_f64() * 1000.0),
    })
}

/// M16 WP2 — what the media viewer needs to know about a file before it builds an asset URL.
///
/// `path` is the **canonical absolute** path [`resolve_within`] returned: the frontend builds an
/// asset URL ONLY from this field, never from a path it assembled itself. snake_case on the wire,
/// like [`FileMarker`].
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MediaStat {
    /// Canonical absolute path (symlinks resolved, confined to the root).
    pub path: String,
    /// File size in bytes. The viewer decides the 4 GiB audio/video cap from this (R-4a).
    pub size: u64,
    /// Modification time as ms since the Unix epoch; the viewer cache-busts its URL with it.
    pub mtime_ms: f64,
    /// The file really starts with `%PDF-`. The PDF `<iframe>` is gated on this, because the asset
    /// handler serves an unrecognized extension as `text/html`, so an HTML file named `x.pdf` would
    /// otherwise run as a page.
    pub pdf_magic: bool,
}

const PDF_MAGIC: &[u8] = b"%PDF-";

/// Stat a media file under `root` for the viewer: confine it with [`resolve_within`], then read
/// its metadata and its first five bytes (the `%PDF-` check). Never reads the body. A missing file
/// or a directory is an error, so the viewer shows its card instead of a broken element.
pub fn stat_media_core(root: &Path, requested: &Path) -> Result<MediaStat, EditorFsError> {
    use std::io::Read;

    let target = resolve_within(root, requested)?;
    let meta = std::fs::metadata(&target)?;
    if meta.is_dir() {
        return Err(EditorFsError::NotAFile(target.display().to_string()));
    }
    let mut head = Vec::with_capacity(PDF_MAGIC.len());
    std::fs::File::open(&target)?
        .take(PDF_MAGIC.len() as u64)
        .read_to_end(&mut head)?;
    Ok(MediaStat {
        path: target.display().to_string(),
        size: meta.len(),
        mtime_ms: mtime_ms_of(&meta)?,
        pdf_magic: head == PDF_MAGIC,
    })
}

/// The absolute `open` binary. Absolute so the launch never depends on the GUI app's PATH.
pub const OPEN_BIN: &str = "/usr/bin/open";

/// Build the `(program, args)` that opens `file` in its default macOS app. Pure, so it is
/// unit-testable with no spawn (the `finder_command` precedent).
pub fn open_command(file: &Path) -> (String, Vec<String>) {
    (OPEN_BIN.to_string(), vec![file.display().to_string()])
}

/// Confine `requested` to `root` and return the canonical file to hand to [`open_command`].
/// A directory is refused: the tab-row button acts on a file tab, and `open <dir>` would open
/// Finder, which the Finder launcher already does.
pub fn default_app_target_core(root: &Path, requested: &Path) -> Result<PathBuf, EditorFsError> {
    let target = resolve_within(root, requested)?;
    let meta = std::fs::metadata(&target)?;
    if meta.is_dir() {
        return Err(EditorFsError::NotAFile(target.display().to_string()));
    }
    Ok(target)
}

/// Delete a single file under `root`. Rejects paths escaping the workspace (the same
/// `resolve_within` guard `write_file_core` uses, so a `..`/absolute-outside/symlink-out
/// target can never remove a file outside the open project). A directory target is
/// rejected with [`EditorFsError::IsDirectory`] — recursive directory delete is out of
/// scope for v1 (QoL-WP5); only single-file delete is supported. A missing file is an
/// [`EditorFsError::Io`] (so the UI treats "nothing to delete" as a real error rather
/// than silently succeeding). The create counterpart is just [`write_file_core`] with
/// empty contents — no dedicated create primitive is needed.
pub fn delete_file_core(root: &Path, requested: &Path) -> Result<(), EditorFsError> {
    let target = resolve_within(root, requested)?;
    // `resolve_within` confines the path but does not assert it is a regular file —
    // guard the directory case explicitly so we never `remove_file` a dir (which errors
    // unhelpfully) and never recurse. A missing target falls through to `remove_file`'s
    // own NotFound Io error.
    let meta = std::fs::metadata(&target)?;
    if meta.is_dir() {
        return Err(EditorFsError::IsDirectory(target.display().to_string()));
    }
    std::fs::remove_file(&target)?;
    Ok(())
}

/// Move a path (file OR directory) under `root` to the macOS Trash (QoL-WP5b). Confined
/// to `root` by the same [`resolve_within`] guard as every other op, so a `..`/absolute-
/// outside/symlink-out target can never trash anything outside the open project. Unlike
/// [`delete_file_core`] (a hard `remove_file`, single-file only), this is **recoverable**:
/// the OS moves the target to the Trash, where the operator can restore it from Finder —
/// the deliberate choice for the folder-delete blast radius (one misclick wipes a subtree).
/// It accepts both files and dirs (so a future WP could route single-file delete through
/// it too), but WP5b wires it only to directory rows. A missing target is an
/// [`EditorFsError::Io`] (so the UI treats "nothing to delete" as a real error, not a
/// silent success); a Trash-move failure is [`EditorFsError::Trash`].
pub fn trash_path_core(root: &Path, requested: &Path) -> Result<(), EditorFsError> {
    let target = resolve_within(root, requested)?;
    // `resolve_within` does not assert the target exists (it allows a not-yet-existing
    // file on write); a delete of a missing path must be a real error, not a Trash no-op.
    if !target.exists() {
        return Err(EditorFsError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("{} does not exist", target.display()),
        )));
    }
    trash::delete(&target).map_err(|source| EditorFsError::Trash {
        path: target.display().to_string(),
        source,
    })
}

/// Create a directory (and any missing intermediate dirs) under `root` (QoL-WP5b).
/// Confined to `root` by [`resolve_within_lexical`] — the parent-tolerant guard — because
/// the requested path may be nested with not-yet-existing intermediate components. Uses
/// `std::fs::create_dir_all`, so it is **idempotent**: creating an already-existing dir is
/// `Ok(())`, not an error (matches the operator mental model — "ensure this folder
/// exists"). An escaping path (`..` above root, absolute-outside) is rejected with
/// [`EditorFsError::OutsideWorkspace`] and nothing is created. Backs both the explicit
/// "new folder" affordance and the nested-file create's `mkdir -p` of the file's parent.
pub fn create_dir_core(root: &Path, requested: &Path) -> Result<(), EditorFsError> {
    let target = resolve_within_lexical(root, requested)?;
    std::fs::create_dir_all(&target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_ok_returns_contents() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("hello.txt"), "hi there").unwrap();
        let out = read_file_core(dir.path(), Path::new("hello.txt")).unwrap();
        assert_eq!(out, "hi there");
    }

    #[test]
    fn read_missing_file_is_io_error() {
        let dir = TempDir::new().unwrap();
        let result = read_file_core(dir.path(), Path::new("nope.txt"));
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn read_non_utf8_is_typed_error_not_lossy() {
        let dir = TempDir::new().unwrap();
        // Invalid UTF-8 byte sequence (0xff is never valid in UTF-8).
        std::fs::write(dir.path().join("bin.dat"), [0xff, 0xfe, 0x00, 0x01]).unwrap();
        let result = read_file_core(dir.path(), Path::new("bin.dat"));
        assert!(matches!(result, Err(EditorFsError::NotUtf8(_))));
    }

    #[test]
    fn read_path_escaping_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        // Create a sibling file outside the workspace root.
        let outside = dir.path().parent().unwrap().join("outside-secret.txt");
        std::fs::write(&outside, "secret").unwrap();
        // A workspace rooted at dir/ws; try to climb out with ..
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = read_file_core(&ws, Path::new("../outside-secret.txt"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "got {result:?}"
        );
        let _ = std::fs::remove_file(outside);
    }

    #[test]
    fn read_absolute_path_outside_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        std::fs::write(other.path().join("elsewhere.txt"), "x").unwrap();
        let result = read_file_core(dir.path(), &other.path().join("elsewhere.txt"));
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
    }

    #[test]
    fn read_absolute_path_inside_root_is_allowed() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("in.txt"), "inside").unwrap();
        // canonicalize the root so the absolute path matches post-canonicalization.
        let canon = dir.path().canonicalize().unwrap();
        let out = read_file_core(dir.path(), &canon.join("in.txt")).unwrap();
        assert_eq!(out, "inside");
    }

    // WP7 (backlog-paydown 2026-07-19) — RED tests for the two accepted-gap hardening items.
    // These assert the ENFORCED invariant the module doc will state once hardened; they FAIL
    // against today's code (leaf symlink is followed; frontend root is unvalidated).

    #[test]
    fn read_leaf_symlink_escaping_root_is_rejected() {
        // The workspace root, and a secret file that lives OUTSIDE it.
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("ws");
        std::fs::create_dir(&root).unwrap();
        let secret = dir.path().join("outside-secret.txt");
        std::fs::write(&secret, "TOP SECRET").unwrap();

        // A LEAF symlink INSIDE the root whose target points at the outside secret.
        // `resolve_within` canonicalizes only the parent (root, which is legal) and
        // re-attaches the raw leaf name un-canonicalized, so today the read follows
        // the symlink and leaks the secret. The guard must reject it.
        let link = root.join("link.txt");
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        let result = read_file_core(&root, Path::new("link.txt"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "a leaf symlink escaping root must be rejected, got {result:?}"
        );
    }

    #[test]
    fn write_through_leaf_symlink_escaping_root_is_rejected() {
        // Same shape, write side: a leaf symlink inside root pointing at an outside
        // file must not let a write clobber the outside target.
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("ws");
        std::fs::create_dir(&root).unwrap();
        let outside = dir.path().join("outside-target.txt");
        std::fs::write(&outside, "original").unwrap();

        let link = root.join("link.txt");
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        let result = write_file_core(&root, Path::new("link.txt"), "clobbered");
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "a write through a leaf symlink escaping root must be rejected, got {result:?}"
        );
        // The outside target must be untouched.
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "original");
    }

    #[test]
    fn read_leaf_symlink_pointing_inside_root_is_still_allowed() {
        // Guard against over-tightening: a leaf symlink whose target is ALSO inside
        // root is legitimate and must keep working after the fix.
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("ws");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("real.txt"), "inside content").unwrap();
        let link = root.join("alias.txt");
        std::os::unix::fs::symlink(root.join("real.txt"), &link).unwrap();

        let out = read_file_core(&root, Path::new("alias.txt")).unwrap();
        assert_eq!(out, "inside content");
    }

    #[test]
    fn destructive_ops_reject_a_leaf_symlink_escaping_root_and_target_survives() {
        // The leaf-symlink guard lives in the shared `resolve_within`, so it must
        // protect the *destructive* consumers too — `delete_file_core` (hard remove)
        // and `trash_path_core` (Trash move) — not just read/write. Pins that a future
        // refactor can't accidentally scope the guard to read/write only and leave a
        // symlink-through-delete/trash escape open. The outside target must survive.
        let dir = TempDir::new().unwrap();
        let root = dir.path().join("ws");
        std::fs::create_dir(&root).unwrap();
        let outside = dir.path().join("outside-victim.txt");
        std::fs::write(&outside, "must survive").unwrap();
        let link = root.join("link.txt");
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        let del = delete_file_core(&root, Path::new("link.txt"));
        assert!(
            matches!(del, Err(EditorFsError::OutsideWorkspace { .. })),
            "delete through a leaf symlink escaping root must be rejected, got {del:?}"
        );
        let trash = trash_path_core(&root, Path::new("link.txt"));
        assert!(
            matches!(trash, Err(EditorFsError::OutsideWorkspace { .. })),
            "trash through a leaf symlink escaping root must be rejected, got {trash:?}"
        );
        assert_eq!(
            std::fs::read_to_string(&outside).unwrap(),
            "must survive",
            "the outside target must be untouched by the rejected delete/trash"
        );
    }

    // ⚠️ The RED-phase comment that stood here was DELETED at the 2026-08-12 paydown sweep.
    // It described this block as "intentionally fails to COMPILE until the fix lands" —
    // historically accurate at feature-reproduce time, and flatly wrong ever since the fix
    // landed, while sitting directly above its own post-fix restatement. A reader met the
    // contradiction before the code. Reproduce-phase narration belongs in the WIP/archive;
    // what stays at the code is the invariant.
    // (`SURFACE-2026-07-20-QUALITY-WP7-STALE-COMPILE-GAP-TEST-COMMENT`.)
    // WP7 gap 2 — the backend now validates a frontend-supplied `root` against the
    // known project list. (Phase-2 anchor: this was the compile-gap red from
    // feature-reproduce; `validate_root` is now implemented.)
    #[test]
    fn validate_root_rejects_a_root_not_in_the_known_project_list() {
        let known = TempDir::new().unwrap();
        let known_root = known.path().to_path_buf();
        // A hostile/unknown root the frontend could pass — not a known project.
        let hostile = TempDir::new().unwrap();

        // The known root itself is honored...
        assert!(validate_root(std::slice::from_ref(&known_root), &known_root).is_ok());
        // ...an unknown root is rejected.
        let result = validate_root(std::slice::from_ref(&known_root), hostile.path());
        assert!(
            matches!(result, Err(EditorFsError::UnknownRoot(_))),
            "a root not among the known projects must be rejected, got {result:?}"
        );
    }

    #[test]
    fn validate_root_honors_a_descendant_of_a_known_project() {
        // The editor may open a file via a nested workspace dir under a recorded
        // project → a descendant of a known root must be accepted.
        let known = TempDir::new().unwrap();
        let nested = known.path().join("packages").join("app");
        std::fs::create_dir_all(&nested).unwrap();
        let result = validate_root(&[known.path().to_path_buf()], &nested);
        assert!(
            result.is_ok(),
            "a descendant of a known project must be honored, got {result:?}"
        );
    }

    #[test]
    fn validate_root_skips_a_stale_known_record_that_no_longer_exists() {
        // A known-project record whose dir was deleted can't authorize anything.
        let real = TempDir::new().unwrap();
        let stale = real.path().join("was-deleted"); // never created
        let hostile = TempDir::new().unwrap();
        // The stale record must not authorize a hostile root...
        let result = validate_root(&[stale], hostile.path());
        assert!(
            matches!(result, Err(EditorFsError::UnknownRoot(_))),
            "a stale known record must not authorize anything, got {result:?}"
        );
        // ...while a live known record still works.
        assert!(validate_root(&[real.path().to_path_buf()], real.path()).is_ok());
    }

    #[test]
    fn validate_root_that_does_not_exist_is_an_io_error() {
        // A requested root that can't be canonicalized (does not exist) surfaces as Io,
        // not a silent pass.
        let known = TempDir::new().unwrap();
        let ghost = known.path().join("no-such-root");
        let result = validate_root(&[known.path().to_path_buf()], &ghost);
        assert!(
            matches!(result, Err(EditorFsError::Io(_))),
            "a non-existent requested root must be an Io error, got {result:?}"
        );
    }

    #[test]
    fn validate_root_tolerates_a_non_canonical_form_of_a_known_root() {
        // The false-positive-rejection guard (the risk flagged at verify-human): a known
        // root recorded in canonical form must still validate when the *requested* root
        // arrives in a NON-canonical form — a `..`-laden path OR a symlinked path — that
        // resolves to the same dir. validate_root canonicalizes BOTH sides, so equivalent
        // forms match; if it compared textually, a legit project would be wrongly rejected.
        let known = TempDir::new().unwrap();
        let known_root = known.path().to_path_buf();

        // (a) `..`-laden form: <root>/sub/.. resolves back to <root>.
        std::fs::create_dir(known.path().join("sub")).unwrap();
        let dotdot_form = known.path().join("sub").join("..");
        assert!(
            validate_root(std::slice::from_ref(&known_root), &dotdot_form).is_ok(),
            "a `..`-laden form of a known root must still validate"
        );

        // (b) symlinked form: a symlink elsewhere pointing at the known root.
        let link_parent = TempDir::new().unwrap();
        let link = link_parent.path().join("proj-link");
        std::os::unix::fs::symlink(known.path(), &link).unwrap();
        assert!(
            validate_root(std::slice::from_ref(&known_root), &link).is_ok(),
            "a symlinked form of a known root must still validate"
        );
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = TempDir::new().unwrap();
        write_file_core(dir.path(), Path::new("note.md"), "# Title\nbody").unwrap();
        let out = read_file_core(dir.path(), Path::new("note.md")).unwrap();
        assert_eq!(out, "# Title\nbody");
    }

    #[test]
    fn write_overwrites_existing_atomically() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("f.txt"), "old").unwrap();
        write_file_core(dir.path(), Path::new("f.txt"), "new contents").unwrap();
        let out = read_file_core(dir.path(), Path::new("f.txt")).unwrap();
        assert_eq!(out, "new contents");
        // No stray .tmp left behind after a successful rename.
        assert!(!dir.path().join("f.txt.tmp").exists());
    }

    #[test]
    fn write_to_missing_parent_dir_is_io_error() {
        let dir = TempDir::new().unwrap();
        // The subdir does not exist → resolve_within's parent canonicalize fails.
        let result = write_file_core(dir.path(), Path::new("no-such-dir/f.txt"), "x");
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn write_path_escaping_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = write_file_core(&ws, Path::new("../escapee.txt"), "nope");
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        // Nothing was written outside.
        assert!(!dir.path().join("escapee.txt").exists());
    }

    #[test]
    fn write_in_nested_existing_dir_round_trips() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("src");
        std::fs::create_dir(&sub).unwrap();
        write_file_core(dir.path(), Path::new("src/lib.rs"), "fn main() {}").unwrap();
        let out = read_file_core(dir.path(), Path::new("src/lib.rs")).unwrap();
        assert_eq!(out, "fn main() {}");
    }

    #[test]
    fn stat_returns_size_and_a_positive_mtime() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("f.txt"), "hello").unwrap();
        let m = stat_file_core(dir.path(), Path::new("f.txt")).unwrap();
        assert_eq!(m.size, 5);
        assert!(m.mtime_ms > 0.0, "mtime should be a real epoch time");
    }

    #[test]
    fn stat_marker_changes_when_the_file_is_rewritten_larger() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("f.txt"), "abc").unwrap();
        let before = stat_file_core(dir.path(), Path::new("f.txt")).unwrap();
        // A size change alone is enough to make the markers unequal (the common case
        // when CC edits a file). mtime may also change, but size proves the contract
        // without depending on filesystem mtime resolution.
        std::fs::write(dir.path().join("f.txt"), "abcdef").unwrap();
        let after = stat_file_core(dir.path(), Path::new("f.txt")).unwrap();
        assert_ne!(before, after);
        assert_eq!(after.size, 6);
    }

    #[test]
    fn stat_missing_file_is_io_error() {
        let dir = TempDir::new().unwrap();
        let result = stat_file_core(dir.path(), Path::new("nope.txt"));
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn stat_path_escaping_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = stat_file_core(&ws, Path::new("../escapee.txt"));
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
    }

    // QoL-WP5 — delete_file_core + the create-via-empty-write primitive.

    #[test]
    fn delete_removes_a_file_and_then_read_errors() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("doomed.txt"), "bye").unwrap();
        delete_file_core(dir.path(), Path::new("doomed.txt")).unwrap();
        assert!(!dir.path().join("doomed.txt").exists());
        // Reading it now is the missing-file Io error (round-trips create→delete).
        let read = read_file_core(dir.path(), Path::new("doomed.txt"));
        assert!(matches!(read, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn delete_path_escaping_root_is_rejected_and_outside_file_survives() {
        let dir = TempDir::new().unwrap();
        // A sibling file outside the workspace root that must NOT be removable.
        let outside = dir.path().parent().unwrap().join("outside-keep.txt");
        std::fs::write(&outside, "keep me").unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = delete_file_core(&ws, Path::new("../../outside-keep.txt"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "got {result:?}"
        );
        assert!(
            outside.exists(),
            "the outside file must survive a rejected delete"
        );
        let _ = std::fs::remove_file(outside);
    }

    #[test]
    fn delete_absolute_path_outside_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let victim = other.path().join("elsewhere.txt");
        std::fs::write(&victim, "x").unwrap();
        let result = delete_file_core(dir.path(), &victim);
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        assert!(victim.exists());
    }

    #[test]
    fn delete_missing_file_is_io_error() {
        let dir = TempDir::new().unwrap();
        let result = delete_file_core(dir.path(), Path::new("nope.txt"));
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    #[test]
    fn delete_directory_is_rejected_not_recursively_removed() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("subdir");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("inner.txt"), "still here").unwrap();
        let result = delete_file_core(dir.path(), Path::new("subdir"));
        assert!(
            matches!(result, Err(EditorFsError::IsDirectory(_))),
            "got {result:?}"
        );
        // The directory + its contents must be untouched (no recursion).
        assert!(sub.join("inner.txt").exists());
    }

    #[test]
    fn create_is_write_file_with_empty_contents() {
        // The "create a new file" primitive is just write_file_core(.., ""); document it.
        let dir = TempDir::new().unwrap();
        write_file_core(dir.path(), Path::new("new.txt"), "").unwrap();
        let out = read_file_core(dir.path(), Path::new("new.txt")).unwrap();
        assert_eq!(out, "");
    }

    // QoL-WP5b — trash_path_core (recoverable delete of a file OR directory). These run
    // on the host macOS, so the target is genuinely moved to the Trash (recoverable,
    // harmless — they're TempDir scratch files). The tests assert the contract we own:
    // the target is GONE from the workspace root, and an escaping path is rejected with
    // the outside target surviving. OS-level recoverability is the crate's job, not ours.

    #[test]
    fn trash_removes_a_directory_and_its_contents_from_the_root() {
        let dir = TempDir::new().unwrap();
        let sub = dir.path().join("subdir");
        std::fs::create_dir(&sub).unwrap();
        std::fs::write(sub.join("inner.txt"), "bye").unwrap();
        std::fs::write(sub.join("nested.rs"), "fn x() {}").unwrap();
        trash_path_core(dir.path(), Path::new("subdir")).unwrap();
        // The whole subtree is gone from the workspace (moved to Trash, not left behind).
        assert!(!sub.exists());
    }

    #[test]
    fn trash_also_works_for_a_single_file() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("doomed.txt"), "bye").unwrap();
        trash_path_core(dir.path(), Path::new("doomed.txt")).unwrap();
        assert!(!dir.path().join("doomed.txt").exists());
    }

    #[test]
    fn trash_path_escaping_root_is_rejected_and_outside_dir_survives() {
        let dir = TempDir::new().unwrap();
        // A sibling dir outside the workspace root that must NOT be trashable.
        let outside = dir.path().parent().unwrap().join("outside-keep-dir");
        std::fs::create_dir(&outside).unwrap();
        std::fs::write(outside.join("keep.txt"), "keep me").unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = trash_path_core(&ws, Path::new("../../outside-keep-dir"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "got {result:?}"
        );
        assert!(
            outside.exists(),
            "the outside dir must survive a rejected trash"
        );
        let _ = std::fs::remove_dir_all(outside);
    }

    #[test]
    fn trash_absolute_path_outside_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let victim = other.path().join("elsewhere");
        std::fs::create_dir(&victim).unwrap();
        let result = trash_path_core(dir.path(), &victim);
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        assert!(victim.exists());
    }

    #[test]
    fn trash_missing_target_is_io_error() {
        let dir = TempDir::new().unwrap();
        let result = trash_path_core(dir.path(), Path::new("no-such-dir"));
        assert!(matches!(result, Err(EditorFsError::Io(_))));
    }

    // QoL-WP5b — create_dir_core (new folder + nested-file-parent mkdir -p) + its
    // parent-tolerant lexical containment guard.

    #[test]
    fn create_dir_makes_a_nested_dir_under_root() {
        let dir = TempDir::new().unwrap();
        create_dir_core(dir.path(), Path::new("a/b/c")).unwrap();
        assert!(dir.path().join("a/b/c").is_dir());
    }

    #[test]
    fn create_dir_is_idempotent_on_an_existing_dir() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join("existing")).unwrap();
        // Creating it again is Ok (create_dir_all semantics), not an error.
        create_dir_core(dir.path(), Path::new("existing")).unwrap();
        assert!(dir.path().join("existing").is_dir());
    }

    #[test]
    fn create_dir_then_write_a_nested_file_round_trips() {
        // The nested-file-create path: mkdir -p the parent, then write the file.
        let dir = TempDir::new().unwrap();
        create_dir_core(dir.path(), Path::new("src/util")).unwrap();
        write_file_core(dir.path(), Path::new("src/util/helpers.rs"), "fn h() {}").unwrap();
        let out = read_file_core(dir.path(), Path::new("src/util/helpers.rs")).unwrap();
        assert_eq!(out, "fn h() {}");
    }

    #[test]
    fn create_dir_escaping_root_with_dotdot_is_rejected_and_nothing_created() {
        let dir = TempDir::new().unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = create_dir_core(&ws, Path::new("../escapee-dir"));
        assert!(
            matches!(result, Err(EditorFsError::OutsideWorkspace { .. })),
            "got {result:?}"
        );
        assert!(!dir.path().join("escapee-dir").exists());
    }

    #[test]
    fn create_dir_climbing_above_root_via_dotdot_chain_is_rejected() {
        // A `..` chain that pops above root must be rejected, not silently clamped.
        let dir = TempDir::new().unwrap();
        let ws = dir.path().join("ws");
        std::fs::create_dir(&ws).unwrap();
        let result = create_dir_core(&ws, Path::new("a/../../../../tmp/evil"));
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
    }

    #[test]
    fn create_dir_absolute_path_outside_root_is_rejected() {
        let dir = TempDir::new().unwrap();
        let other = TempDir::new().unwrap();
        let victim = other.path().join("evil-dir");
        let result = create_dir_core(dir.path(), &victim);
        assert!(matches!(
            result,
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        assert!(!victim.exists());
    }

    #[test]
    fn create_dir_with_interior_dotdot_that_stays_inside_is_allowed() {
        // `a/../b` normalizes to `b` (still inside root) — allowed.
        let dir = TempDir::new().unwrap();
        create_dir_core(dir.path(), Path::new("a/../b")).unwrap();
        assert!(dir.path().join("b").is_dir());
    }

    // ── M16 WP2: read cap + NUL sniff ─────────────────────────────────────────────────────

    /// A sparse file of `len` bytes (no real disk cost), optionally with `head` written at byte 0.
    fn sparse(dir: &Path, name: &str, len: u64, head: &[u8]) -> PathBuf {
        use std::io::Write;
        let p = dir.join(name);
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(head).unwrap();
        f.set_len(len).unwrap();
        p
    }

    #[test]
    fn read_over_the_cap_is_too_large_with_its_size_and_limit() {
        let dir = TempDir::new().unwrap();
        sparse(dir.path(), "big.txt", READ_FILE_MAX_BYTES + 1, b"text");
        match read_file_core(dir.path(), Path::new("big.txt")) {
            Err(EditorFsError::TooLarge { size, limit, .. }) => {
                assert_eq!(size, READ_FILE_MAX_BYTES + 1);
                assert_eq!(limit, READ_FILE_MAX_BYTES);
            }
            other => panic!("expected TooLarge, got {other:?}"),
        }
    }

    #[test]
    fn read_exactly_at_the_cap_is_allowed() {
        let dir = TempDir::new().unwrap();
        let text = "a".repeat(READ_FILE_MAX_BYTES as usize);
        std::fs::write(dir.path().join("edge.txt"), &text).unwrap();
        let out = read_file_core(dir.path(), Path::new("edge.txt")).unwrap();
        assert_eq!(out.len() as u64, READ_FILE_MAX_BYTES);
    }

    #[test]
    fn read_nul_in_the_head_takes_the_sniff_arm() {
        // 60 MiB (under the cap), NUL at byte 0: refused by the sniff, whose message names it.
        let dir = TempDir::new().unwrap();
        sparse(dir.path(), "blob.bin", 60 * 1024 * 1024, b"\0PK");
        match read_file_core(dir.path(), Path::new("blob.bin")) {
            Err(EditorFsError::NotUtf8(msg)) => {
                assert!(
                    msg.contains("NUL byte in the first"),
                    "sniff arm not taken: {msg}"
                )
            }
            other => panic!("expected NotUtf8 from the sniff, got {other:?}"),
        }
    }

    #[test]
    fn read_invalid_utf8_without_a_nul_takes_the_decode_arm() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("latin1.txt"), [b'c', b'a', b'f', 0xe9]).unwrap();
        match read_file_core(dir.path(), Path::new("latin1.txt")) {
            Err(EditorFsError::NotUtf8(msg)) => {
                assert!(!msg.contains("NUL byte"), "wrong arm: {msg}")
            }
            other => panic!("expected NotUtf8 from the decoder, got {other:?}"),
        }
    }

    #[test]
    fn read_utf8_longer_than_the_sniff_window_is_read_whole() {
        let dir = TempDir::new().unwrap();
        let text = "é".repeat(10_000); // 20 000 bytes, a multibyte char straddles the 8 KiB edge
        std::fs::write(dir.path().join("long.txt"), &text).unwrap();
        assert_eq!(
            read_file_core(dir.path(), Path::new("long.txt")).unwrap(),
            text
        );
    }

    /// The frontend routes these two errors to the media card by message PREFIX. Both sides read
    /// the prefixes from one JSON file, so a reworded `#[error]` fails here.
    #[test]
    fn routed_error_messages_start_with_the_shared_prefixes() {
        let prefixes: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/components/workspace/editor/readErrorPrefixes.json"
        ))
        .unwrap();
        let not_utf8 = EditorFsError::NotUtf8("x".into()).to_string();
        let too_large = EditorFsError::TooLarge {
            path: "x".into(),
            size: 2,
            limit: 1,
        }
        .to_string();
        assert!(
            not_utf8.starts_with(prefixes["notUtf8"].as_str().unwrap()),
            "{not_utf8}"
        );
        assert!(
            too_large.starts_with(prefixes["tooLarge"].as_str().unwrap()),
            "{too_large}"
        );
        // Neither prefix may be a prefix of the other, or routing becomes order-dependent.
        let (a, b) = (
            prefixes["notUtf8"].as_str().unwrap(),
            prefixes["tooLarge"].as_str().unwrap(),
        );
        assert!(!a.starts_with(b) && !b.starts_with(a));
    }

    // ── M16 WP2: stat_media ───────────────────────────────────────────────────────────────

    #[test]
    fn stat_media_returns_the_canonical_path_size_and_mtime() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join("img")).unwrap();
        std::fs::write(dir.path().join("img/a.png"), [0x89, b'P', b'N', b'G', 1, 2]).unwrap();
        let stat = stat_media_core(dir.path(), Path::new("img/../img/a.png")).unwrap();
        let canon = dir.path().join("img/a.png").canonicalize().unwrap();
        assert_eq!(stat.path, canon.display().to_string());
        assert_eq!(stat.size, 6);
        assert_eq!(
            stat.mtime_ms,
            stat_file_core(dir.path(), Path::new("img/a.png"))
                .unwrap()
                .mtime_ms
        );
        assert!(!stat.pdf_magic);
    }

    #[test]
    fn stat_media_pdf_magic_reads_content_not_extension() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join("real.pdf"), b"%PDF-1.7\n...").unwrap();
        std::fs::write(
            dir.path().join("evil.pdf"),
            b"<html><script>1</script></html>",
        )
        .unwrap();
        std::fs::write(dir.path().join("renamed.bin"), b"%PDF-1.4").unwrap();
        std::fs::write(dir.path().join("short.pdf"), b"%PD").unwrap();
        let magic = |n: &str| stat_media_core(dir.path(), Path::new(n)).unwrap().pdf_magic;
        assert!(magic("real.pdf"));
        assert!(!magic("evil.pdf"));
        assert!(magic("renamed.bin"));
        assert!(!magic("short.pdf"));
    }

    #[test]
    fn stat_media_refuses_every_escape() {
        let outer = TempDir::new().unwrap();
        let ws = outer.path().join("ws");
        let out = outer.path().join("out");
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::create_dir_all(&out).unwrap();
        std::fs::write(out.join("secret.png"), b"x").unwrap();
        std::os::unix::fs::symlink(out.join("secret.png"), ws.join("leaf.png")).unwrap();
        std::os::unix::fs::symlink(&out, ws.join("dirlink")).unwrap();
        for req in [
            PathBuf::from("../out/secret.png"),
            out.join("secret.png"),
            PathBuf::from("leaf.png"),
            PathBuf::from("dirlink/secret.png"),
        ] {
            let r = stat_media_core(&ws, &req);
            assert!(
                matches!(r, Err(EditorFsError::OutsideWorkspace { .. })),
                "{req:?} was not refused: {r:?}"
            );
        }
    }

    #[test]
    fn stat_media_on_a_directory_or_missing_file_is_an_error() {
        let dir = TempDir::new().unwrap();
        std::fs::create_dir(dir.path().join("sub")).unwrap();
        match stat_media_core(dir.path(), Path::new("sub")) {
            Err(e @ EditorFsError::NotAFile(_)) => {
                assert!(!e.to_string().contains("delete"), "{e}")
            }
            other => panic!("expected NotAFile, got {other:?}"),
        }
        assert!(matches!(
            stat_media_core(dir.path(), Path::new("gone.png")),
            Err(EditorFsError::Io(_))
        ));
    }

    // ── M16 WP2: open in default app ──────────────────────────────────────────────────────

    #[test]
    fn open_command_is_absolute_open_with_the_file() {
        let (program, args) = open_command(Path::new("/p/a b.png"));
        assert_eq!(program, "/usr/bin/open");
        assert_eq!(args, vec!["/p/a b.png".to_string()]);
    }

    #[test]
    fn default_app_target_is_confined_and_file_only() {
        let outer = TempDir::new().unwrap();
        let ws = outer.path().join("ws");
        std::fs::create_dir_all(ws.join("d")).unwrap();
        std::fs::write(outer.path().join("x.png"), b"x").unwrap();
        std::fs::write(ws.join("in.png"), b"x").unwrap();
        std::os::unix::fs::symlink(outer.path().join("x.png"), ws.join("leaf.png")).unwrap();
        assert_eq!(
            default_app_target_core(&ws, Path::new("in.png")).unwrap(),
            ws.join("in.png").canonicalize().unwrap()
        );
        assert!(matches!(
            default_app_target_core(&ws, Path::new("../x.png")),
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        assert!(matches!(
            default_app_target_core(&ws, Path::new("leaf.png")),
            Err(EditorFsError::OutsideWorkspace { .. })
        ));
        assert!(matches!(
            default_app_target_core(&ws, Path::new("d")),
            Err(EditorFsError::NotAFile(_))
        ));
    }
}
