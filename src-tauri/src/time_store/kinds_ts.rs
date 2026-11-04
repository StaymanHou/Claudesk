//! Test-only: read the frontend's kind lists from `kinds.ts` at test time, so the Rust family
//! sums ([`super::query::AI_FAMILY`], [`super::query::PAINTED`]) are checked against the file
//! the Week view actually renders from, never against a second Rust copy.
//!
//! `std::fs` at run time, not `include_str!`: the file is read when the test runs, with no
//! bundler in between (the Rust analogue of a Vitest `node:fs` read).

use crate::reclassify::Kind;

const KINDS_TS: &str = "../src/components/workspace/dashboard/kinds.ts";

const ALL_KINDS: [Kind; 6] = [
    Kind::AiDoing,
    Kind::Subagent,
    Kind::AiReasoning,
    Kind::Typing,
    Kind::Reviewing,
    Kind::Away,
];

/// The kinds named in `export const <name> … = [ … ];` in `kinds.ts`, in source order.
/// Panics (never skips) on a missing declaration or a name no [`Kind`] carries, so a renamed
/// list or a new kind fails the test instead of quietly shrinking what it checks.
pub(crate) fn kind_list(name: &str) -> Vec<Kind> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(KINDS_TS);
    let src = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));
    let anchor = format!("export const {name}:");
    let start = src
        .find(&anchor)
        .unwrap_or_else(|| panic!("`{anchor}` not found in kinds.ts"));
    let body_start = start
        + src[start..]
            .find("= [")
            .unwrap_or_else(|| panic!("`{name}` has no `= [` initializer"));
    let body_end = body_start
        + src[body_start..]
            .find("];")
            .unwrap_or_else(|| panic!("`{name}` has no closing `];`"));
    let body: String = src[body_start..body_end]
        .lines()
        .map(|l| l.split("//").next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n");
    let names: Vec<&str> = body.split('"').skip(1).step_by(2).collect();
    assert!(!names.is_empty(), "`{name}` parsed to no kinds");
    names
        .into_iter()
        .map(|n| {
            *ALL_KINDS
                .iter()
                .find(|k| k.as_str() == n)
                .unwrap_or_else(|| panic!("kinds.ts `{name}` names {n:?}, which no Kind carries"))
        })
        .collect()
}

/// `RENDER_ORDER` minus `away`: the kinds `weekMath.ts` `cellTotal` paints.
pub(crate) fn painted_kinds() -> Vec<Kind> {
    kind_list("RENDER_ORDER")
        .into_iter()
        .filter(|k| *k != Kind::Away)
        .collect()
}
