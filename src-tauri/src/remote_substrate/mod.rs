//! M18 WP4 — the workflow substrate of a remote HOST ACCOUNT, as Claudesk knows it
//! (`arch/claude-substrate.md` → "Remote hosts (M18)" §R.1–§R.2).
//!
//! The open check's one exec runs `remote_cmd::SUBSTRATE_PROBE` (the local predicate, asked on
//! the host) and reads the host's install record. This module turns that read into a
//! [`HostSubstrate`] with the SAME decision the local substrate uses: presence from the probe,
//! provenance from a well-formed record and nothing else (`workflow_install::resolve_state`, the
//! never-infer rule), the record parsed by the LOCAL parser (`provenance::parse_record`). The value
//! is cached per host in `LinkRegistry` and is the funnel's third input
//! (`config_store::profiles::workflow_applicable`).
//!
//! Pure: no filesystem, no ssh. WP5–WP7 add the readout, Install, Update and Uninstall around it.

use serde::Serialize;

use crate::remote_cmd::SubstrateRead;
use crate::workflow_install::provenance::{self, InstallRecord};
use crate::workflow_install::{resolve_state, InstallState};

/// A host account's workflow substrate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum HostSubstrate {
    /// Not known: never probed in this app session, or the probe printed no answer. ⚠️ Fails
    /// CLOSED in the funnel, like an absent substrate.
    Unknown,
    /// Probed: no workflow-system skill is linked for this account.
    Absent,
    /// Present, with no well-formed host record: a hand install (the mini's live account), or a
    /// damaged record. Claudesk describes it and never acts on it.
    Developer {
        root: Option<String>,
        head: Option<String>,
    },
    /// Present AND recorded: Claudesk installed it (WP6). The only state WP7 acts on.
    Managed {
        root: Option<String>,
        head: Option<String>,
        record: InstallRecord,
    },
}

impl HostSubstrate {
    /// The open check's read → the substrate. A record crosses as raw bytes and is parsed here, by
    /// the local parser: absent, malformed and the wrong shape all collapse to "no record".
    pub fn from_read(read: &SubstrateRead) -> Self {
        let probe = match read {
            SubstrateRead::Unknown => return Self::Unknown,
            SubstrateRead::Known(probe) => probe,
        };
        let record = probe.record.as_deref().and_then(provenance::parse_record);
        let root = probe.root.clone();
        let head = probe.head.clone();
        match (resolve_state(probe.present, record.as_ref()), record) {
            (InstallState::Absent, _) => Self::Absent,
            (InstallState::Managed, Some(record)) => Self::Managed { root, head, record },
            // `resolve_state` yields Managed only WITH a record, so `(Managed, None)` cannot occur;
            // were it to, Developer (describe, never act) is the safe landing.
            (InstallState::Developer, _) | (InstallState::Managed, None) => {
                Self::Developer { root, head }
            }
        }
    }

    /// Whether the workflow system is there (Managed or Developer). ⚠️ Unknown is NOT present:
    /// the funnel's host input fails closed (`config_store::profiles::workflow_applicable`).
    pub fn is_present(&self) -> bool {
        matches!(self, Self::Developer { .. } | Self::Managed { .. })
    }
}

/// The `remote-substrate` event: one host's substrate changed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SubstrateEvent {
    pub host: String,
    pub substrate: HostSubstrate,
}

/// The event name the frontend's `useHostSubstrate` listens to.
pub const SUBSTRATE_EVENT: &str = "remote-substrate";

#[cfg(test)]
mod parity;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::remote_cmd::HostProbe;

    fn probe(present: bool, record: Option<&[u8]>) -> SubstrateRead {
        SubstrateRead::Known(HostProbe {
            present,
            root: Some("/Users/me/repo".into()),
            head: Some("a".repeat(40)),
            record: record.map(<[u8]>::to_vec),
        })
    }

    const RECORD: &[u8] = br#"{"clone_path":"/Users/me/.claudesk/vendor/my-claude-code-customization","installed_at":"2026-11-20T00:00:00Z","origin_url":"https://example.com/r.git"}"#;

    #[test]
    fn the_read_maps_to_the_local_states_with_the_never_infer_rule() {
        assert_eq!(
            HostSubstrate::from_read(&SubstrateRead::Unknown),
            HostSubstrate::Unknown
        );
        assert_eq!(
            HostSubstrate::from_read(&probe(false, None)),
            HostSubstrate::Absent
        );
        // A leftover record without the substrate is still Absent (as local).
        assert_eq!(
            HostSubstrate::from_read(&probe(false, Some(RECORD))),
            HostSubstrate::Absent
        );
        assert_eq!(
            HostSubstrate::from_read(&probe(true, None)),
            HostSubstrate::Developer {
                root: Some("/Users/me/repo".into()),
                head: Some("a".repeat(40)),
            }
        );
        let managed = HostSubstrate::from_read(&probe(true, Some(RECORD)));
        assert!(
            matches!(&managed, HostSubstrate::Managed { record, .. }
                if record.origin_url == "https://example.com/r.git"),
            "{managed:?}"
        );
    }

    #[test]
    fn a_malformed_or_wrong_shaped_record_reads_developer_never_managed() {
        for bad in [
            &b""[..],
            b"{not json",
            br#"{"x":1}"#,
            br#"{"clone_path":"/a","installed_at":"t"}"#,
            b"\xff\xfe",
        ] {
            assert!(
                matches!(
                    HostSubstrate::from_read(&probe(true, Some(bad))),
                    HostSubstrate::Developer { .. }
                ),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn the_wire_shape_is_tagged_by_state() {
        let v = serde_json::to_value(SubstrateEvent {
            host: "me@mini".into(),
            substrate: HostSubstrate::Developer {
                root: Some("/r".into()),
                head: None,
            },
        })
        .unwrap();
        assert_eq!(
            v,
            serde_json::json!({"host": "me@mini", "substrate": {"state": "developer", "root": "/r", "head": null}})
        );
        assert_eq!(
            serde_json::to_value(HostSubstrate::Unknown).unwrap(),
            serde_json::json!({"state": "unknown"})
        );
    }
}
