//! `claudesk export-week` — the Week view's data as JSON on stdout, for a consumer that runs
//! unattended (Neo's Monday report; requested 2026-09-28, request and reply kept in Neo's repo).
//!
//! ```text
//! /Applications/Claudesk.app/Contents/MacOS/claudesk export-week [--monday YYYY-MM-DD] [--json]
//! ```
//!
//! - **No GUI.** [`crate::run`] dispatches here before the Tauri `Builder` exists, so nothing
//!   opens, and the process exits with the code [`run_cli`] returns.
//! - **Read-only.** The DB is opened `SQLITE_OPEN_READ_ONLY` and never bootstrapped, so it is
//!   safe while the app is running and writing (WAL readers do not block the writer).
//! - **Unfiltered** (operator ruling, 2026-09-28): every project the Week view shows, personal
//!   ones included. The consumer filters.
//! - `--monday` accepts any date and snaps it to its Monday, as the Week view does; omitted, it
//!   exports the current week. `--json` is accepted and ignored (JSON is the only format).
//! - Exit codes: `0` success · `1` the DB is missing or unreadable · `2` usage error. On any
//!   non-zero exit stdout is EMPTY and the reason is on stderr.

use std::collections::{BTreeMap, HashMap};
use std::io::Write;
use std::path::{Path, PathBuf};

use chrono::{Duration, Local, NaiveDate, TimeZone};
use serde::Serialize;

use super::commands::{monday_of, TimeStore, TIME_STORE_DB_NAME as DB_NAME};
use super::query::{
    build_metrics, build_week_ms, local_midnight_ms, EngagedSession, RollupCell, RollupCellMs,
};

/// The subcommand name — the first argument after the binary.
pub const SUBCOMMAND: &str = "export-week";

/// The export's schema id. Bump the trailing number on any breaking shape change.
pub const SCHEMA: &str = "claudesk.week-export/1";

const USAGE: &str = "usage: claudesk export-week [--monday YYYY-MM-DD] [--json]";

/// Why a parse failed or a run could not produce an export.
#[derive(Debug, PartialEq, Eq)]
pub enum ExportError {
    /// Bad arguments → exit 2.
    Usage(String),
    /// The DB is missing or unreadable → exit 1.
    Db(String),
}

impl ExportError {
    fn exit_code(&self) -> i32 {
        match self {
            ExportError::Usage(_) => 2,
            ExportError::Db(_) => 1,
        }
    }
}

/// Parsed `export-week` arguments.
#[derive(Debug, PartialEq, Eq)]
pub struct ExportArgs {
    /// Any date in the wanted week; `None` = the current week.
    pub day: Option<NaiveDate>,
    /// `--help` / `-h`: print usage to stdout and exit 0.
    pub help: bool,
}

/// Is this process invocation the export subcommand? (`args[0]` is the binary.)
pub fn is_export_invocation(args: &[String]) -> bool {
    args.get(1).map(String::as_str) == Some(SUBCOMMAND)
}

/// Parse the arguments AFTER the subcommand name.
pub fn parse_args(rest: &[String]) -> Result<ExportArgs, ExportError> {
    let mut day = None;
    let mut help = false;
    let mut it = rest.iter();
    while let Some(arg) = it.next() {
        let value = match arg.as_str() {
            "--json" => continue,
            "-h" | "--help" => {
                help = true;
                continue;
            }
            "--monday" => it
                .next()
                .ok_or_else(|| ExportError::Usage(format!("--monday needs a date\n{USAGE}")))?
                .clone(),
            other => match other.strip_prefix("--monday=") {
                Some(v) => v.to_string(),
                None => {
                    return Err(ExportError::Usage(format!(
                        "unknown argument {other:?}\n{USAGE}"
                    )))
                }
            },
        };
        day = Some(NaiveDate::parse_from_str(&value, "%Y-%m-%d").map_err(|_| {
            ExportError::Usage(format!(
                "--monday: {value:?} is not a YYYY-MM-DD date\n{USAGE}"
            ))
        })?);
    }
    Ok(ExportArgs { day, help })
}

/// `$HOME/Library/Application Support/<identifier>/time-analytics.sqlite` — the same path
/// `app_data_dir()` resolves for the running app, computed without an `AppHandle`.
pub fn db_path(home: &Path, identifier: &str) -> PathBuf {
    home.join("Library/Application Support")
        .join(identifier)
        .join(DB_NAME)
}

/// Open the analytics DB read-only. Never bootstraps: a missing DB is an error, not a new file.
fn open_read_only(path: &Path) -> Result<TimeStore, ExportError> {
    if !path.exists() {
        return Err(ExportError::Db(format!(
            "no analytics database at {} (is time tracking on?)",
            path.display()
        )));
    }
    let conn = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| ExportError::Db(format!("could not open {}: {e}", path.display())))?;
    conn.busy_timeout(std::time::Duration::from_millis(2000))
        .map_err(|e| ExportError::Db(format!("could not set busy_timeout: {e}")))?;
    Ok(TimeStore::new(conn))
}

/// The zone the export's calendar is in.
#[derive(Debug, Serialize)]
pub struct TzInfo {
    /// IANA name (`"America/New_York"`), or `null` if the OS would not say.
    pub name: Option<String>,
    /// The UTC offset at the week's Monday 00:00 local, e.g. `"-04:00"`.
    pub utc_offset: String,
}

/// One day of one project. Every duration is exact milliseconds; `minutes` is the Week view's
/// own per-kind rounding (round-half-up), so it matches the screen.
#[derive(Debug, Serialize)]
pub struct CellExport {
    pub date: String,
    pub ai_doing_ms: i64,
    pub subagent_ms: i64,
    pub ai_reasoning_ms: i64,
    pub typing_ms: i64,
    pub reviewing_ms: i64,
    pub away_ms: i64,
    pub prompts: i64,
    pub minutes: RollupCell,
    /// The Week view's DAY LABEL: every rounded kind except `away` (`weekMath.ts` `cellTotal`).
    pub painted_min: i64,
}

/// One project's week.
#[derive(Debug, Serialize)]
pub struct ProjectExport {
    /// The Week view's row id (the alias).
    pub id: String,
    /// Full, untruncated project name: the git-root basename of the working directory.
    pub alias: String,
    /// The working directory the project's sessions ran in.
    pub path: String,
    /// The Week view's `WEEK TOTAL` badge: the AI family (`ai_doing + subagent +
    /// ai_reasoning`) summed over the 7 ROUNDED cells (`weekMath.ts` `projectWeekActive`).
    pub week_total_min: i64,
    /// The same AI family at exact ms (may differ from `week_total_min * 60000` by rounding).
    pub ai_family_ms: i64,
    /// Every kind except `away`, exact ms.
    pub painted_non_away_ms: i64,
    pub prompts: i64,
    /// 7 cells, Mon→Sun.
    pub cells: Vec<CellExport>,
}

/// The whole export document.
#[derive(Debug, Serialize)]
pub struct WeekExport {
    pub schema: &'static str,
    pub generated_at: String,
    pub tz: TzInfo,
    /// `"YYYY-MM-DD"` of the week's Monday / Sunday.
    pub monday: String,
    pub sunday: String,
    /// The Week view's heading, e.g. `"WEEK 39 · SEP 21 — SEP 27"`.
    pub label: String,
    /// The 7 dates, Mon→Sun, `"YYYY-MM-DD"`.
    pub days: Vec<String>,
    /// The Week view's 7 column labels (`"MON 21"` …).
    pub day_labels: Vec<String>,
    /// What the figures mean, so a consumer need not read `weekMath.ts`.
    pub definitions: BTreeMap<&'static str, &'static str>,
    /// Window-level engaged time for the same 7 days. `wallclock_ms` counts concurrent sessions
    /// ONCE; `effort_ms` sums them, which is why per-project sums can exceed 168 h in a week.
    pub engaged: EngagedSession,
    /// In the Week view's row order.
    pub projects: Vec<ProjectExport>,
}

fn definitions() -> BTreeMap<&'static str, &'static str> {
    BTreeMap::from([
        (
            "week_total_min",
            "The Week view's WEEK TOTAL badge: ai_doing + subagent + ai_reasoning, summed over the 7 rounded cells.",
        ),
        (
            "painted_min",
            "The Week view's per-day label: every kind except away, from the rounded cell.",
        ),
        (
            "ai_family_ms",
            "ai_doing + subagent + ai_reasoning at exact milliseconds.",
        ),
        (
            "painted_non_away_ms",
            "Every kind except away at exact milliseconds.",
        ),
        (
            "engaged",
            "Window-level: wallclock_ms merges concurrent sessions; effort_ms sums them; multiplier = effort / wallclock.",
        ),
        (
            "row_order",
            "The Week view's order: ai_doing + subagent minutes descending, then alias.",
        ),
    ])
}

fn cell_export(date: NaiveDate, c: RollupCellMs) -> CellExport {
    let minutes = c.into_rollup_cell();
    let painted_min = minutes.ai_doing
        + minutes.subagent
        + minutes.ai_reasoning
        + minutes.typing
        + minutes.reviewing;
    CellExport {
        date: date.format("%Y-%m-%d").to_string(),
        ai_doing_ms: c.ai_doing_ms,
        subagent_ms: c.subagent_ms,
        ai_reasoning_ms: c.ai_reasoning_ms,
        typing_ms: c.typing_ms,
        reviewing_ms: c.reviewing_ms,
        away_ms: c.away_ms,
        prompts: c.prompts,
        minutes,
        painted_min,
    }
}

/// Build the export for the week containing `day` from that week's rows. Pure apart from the
/// local-tz reads the whole query layer already makes; `now`/`tz_name` are parameters so
/// tests are deterministic.
pub fn build_export(
    day: NaiveDate,
    rows: &[crate::reclassify::EventRow],
    generated_at: String,
    tz_name: Option<String>,
) -> Result<WeekExport, String> {
    let monday = monday_of(day);
    let sunday = monday + Duration::days(6);
    let week = build_week_ms(monday, rows, &HashMap::new())?;
    let dates: Vec<NaiveDate> = (0..7).map(|i| monday + Duration::days(i)).collect();
    let engaged = build_metrics(monday, sunday, rows).engaged_session;
    let utc_offset = Local
        .timestamp_millis_opt(local_midnight_ms(monday))
        .single()
        .map(|t| t.offset().to_string())
        .unwrap_or_default();

    let projects = week
        .projects
        .into_iter()
        .map(|p| {
            let cells: Vec<CellExport> = dates
                .iter()
                .zip(p.cells.iter())
                .map(|(d, c)| cell_export(*d, *c))
                .collect();
            let week_total_min = cells
                .iter()
                .map(|c| c.minutes.ai_doing + c.minutes.subagent + c.minutes.ai_reasoning)
                .sum();
            let ai_family_ms = p
                .cells
                .iter()
                .map(|c| c.ai_doing_ms + c.subagent_ms + c.ai_reasoning_ms)
                .sum();
            let painted_non_away_ms = p
                .cells
                .iter()
                .map(|c| {
                    c.ai_doing_ms + c.subagent_ms + c.ai_reasoning_ms + c.typing_ms + c.reviewing_ms
                })
                .sum();
            ProjectExport {
                id: p.alias.clone(),
                alias: p.alias,
                path: p.path,
                week_total_min,
                ai_family_ms,
                painted_non_away_ms,
                prompts: p.cells.iter().map(|c| c.prompts).sum(),
                cells,
            }
        })
        .collect();

    Ok(WeekExport {
        schema: SCHEMA,
        generated_at,
        tz: TzInfo {
            name: tz_name,
            utc_offset,
        },
        monday: monday.format("%Y-%m-%d").to_string(),
        sunday: sunday.format("%Y-%m-%d").to_string(),
        label: week.label,
        days: dates
            .iter()
            .map(|d| d.format("%Y-%m-%d").to_string())
            .collect(),
        day_labels: week.day_labels,
        definitions: definitions(),
        engaged,
        projects,
    })
}

fn export_json(rest: &[String], db: &Path) -> Result<Option<String>, ExportError> {
    let args = parse_args(rest)?;
    if args.help {
        return Ok(None);
    }
    let day = args.day.unwrap_or_else(|| Local::now().date_naive());
    let monday = monday_of(day);
    let store = open_read_only(db)?;
    let rows = store
        .query_window(
            local_midnight_ms(monday),
            local_midnight_ms(monday + Duration::days(7)),
        )
        .map_err(ExportError::Db)?;
    let export = build_export(
        day,
        &rows,
        Local::now().to_rfc3339(),
        iana_time_zone::get_timezone().ok(),
    )
    .map_err(ExportError::Db)?;
    serde_json::to_string_pretty(&export)
        .map(Some)
        .map_err(|e| ExportError::Db(format!("could not serialize the export: {e}")))
}

/// Run the subcommand: `rest` is the arguments after `export-week`, `db` the analytics DB.
/// Writes the export (or `--help`) to `out`, any failure to `err`, and returns the exit code.
/// Nothing reaches `out` on failure, so a consumer never parses half a document.
pub fn run_cli(rest: &[String], db: &Path, out: &mut dyn Write, err: &mut dyn Write) -> i32 {
    match export_json(rest, db) {
        Ok(Some(json)) => match writeln!(out, "{json}") {
            Ok(()) => 0,
            Err(e) => {
                let _ = writeln!(err, "claudesk export-week: could not write stdout: {e}");
                1
            }
        },
        Ok(None) => {
            let _ = writeln!(out, "{USAGE}");
            0
        }
        Err(e) => {
            let msg = match &e {
                ExportError::Usage(m) | ExportError::Db(m) => m.clone(),
            };
            let _ = writeln!(err, "claudesk export-week: {msg}");
            e.exit_code()
        }
    }
}

/// The process entry for `claudesk export-week …`: `rest` is `argv[2..]`. Resolves the DB from
/// `$HOME` + the running build's bundle identifier (so a dev build reads its own dev DB) and
/// returns the exit code for [`crate::run`] to exit with.
pub fn main(identifier: &str, rest: &[String]) -> i32 {
    let (stdout, stderr) = (std::io::stdout(), std::io::stderr());
    let (mut out, mut err) = (stdout.lock(), stderr.lock());
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        let _ = writeln!(err, "claudesk export-week: $HOME is not set");
        return 1;
    };
    run_cli(rest, &db_path(&home, identifier), &mut out, &mut err)
}

#[cfg(test)]
mod tests;
