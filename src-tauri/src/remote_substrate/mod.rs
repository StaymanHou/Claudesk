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
//! Pure: no filesystem, no ssh. WP5 adds the drift verdict ([`Drift`], Settings → Remote hosts);
//! WP6–WP7 add Install, Update and Uninstall around it.

use serde::Serialize;

use crate::remote_cmd::{DriftLine, SubstrateRead, DEV_TOOLS_FIX};
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

/// M18 WP5 (§R.4) — the host clone against GitHub, as Settings → Remote hosts shows it. Compared
/// on the full HEADs; the readout prints them short.
///
/// ⚠️ `Differs` means "the two HEADs differ" (D6). Without a `fetch` (a write into a clone Claudesk
/// may not own) a host that is ahead or has diverged cannot be told apart from one that is behind,
/// so the variant does not claim "behind" (renamed from `Behind` at M18 WP6: WP7 gates
/// Update on it, and `pull --ff-only` fails on an ahead or diverged clone). The readout still says
/// "Behind GitHub" (D6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "drift", rename_all = "snake_case")]
pub enum Drift {
    UpToDate {
        head: String,
        remote: String,
    },
    Differs {
        head: String,
        remote: String,
    },
    /// No verdict, with the reason in plain words.
    CantCheck {
        reason: String,
    },
}

impl Drift {
    /// The verdict for `substrate` from the refresh's drift line. `None` when there is nothing to
    /// compare: the workflow system is not there (Absent) or its state is not known.
    pub fn decide(substrate: &HostSubstrate, line: Option<&DriftLine>) -> Option<Self> {
        let (root, head) = match substrate {
            HostSubstrate::Unknown | HostSubstrate::Absent => return None,
            HostSubstrate::Developer { root, head } | HostSubstrate::Managed { root, head, .. } => {
                (root, head)
            }
        };
        let cant = |reason: &str| {
            Some(Self::CantCheck {
                reason: reason.to_string(),
            })
        };
        if root.is_none() {
            return cant("Claudesk couldn't resolve the install's folder on the host");
        }
        match line {
            None => cant("the host printed no answer"),
            Some(DriftLine::NoDevTools) => Some(Self::CantCheck {
                reason: format!("the host has no developer tools ({DEV_TOOLS_FIX})"),
            }),
            Some(DriftLine::NoOrigin) => cant("the install has no `origin` remote"),
            Some(DriftLine::Git(detail)) if detail.is_empty() => {
                cant("`git ls-remote` gave no answer")
            }
            Some(DriftLine::Git(detail)) => Some(Self::CantCheck {
                reason: format!("`git ls-remote` failed: {detail}"),
            }),
            Some(DriftLine::Remote(remote)) => match head {
                None => cant("Claudesk couldn't read the install's HEAD"),
                Some(head) if head == remote => Some(Self::UpToDate {
                    head: head.clone(),
                    remote: remote.clone(),
                }),
                Some(head) => Some(Self::Differs {
                    head: head.clone(),
                    remote: remote.clone(),
                }),
            },
        }
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
mod refresh_script;

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

    fn developer(head: Option<&str>) -> HostSubstrate {
        HostSubstrate::Developer {
            root: Some("/Users/me/repo".into()),
            head: head.map(str::to_string),
        }
    }

    const A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const B: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    #[test]
    fn drift_compares_the_full_heads() {
        let remote = DriftLine::Remote(A.into());
        assert_eq!(
            Drift::decide(&developer(Some(A)), Some(&remote)),
            Some(Drift::UpToDate {
                head: A.into(),
                remote: A.into()
            })
        );
        assert_eq!(
            Drift::decide(&developer(Some(B)), Some(&remote)),
            Some(Drift::Differs {
                head: B.into(),
                remote: A.into()
            })
        );
        // Managed compares the same way (its HEAD is the fixture's all-`a` sha).
        let managed = HostSubstrate::from_read(&probe(true, Some(RECORD)));
        assert!(matches!(
            Drift::decide(&managed, Some(&remote)),
            Some(Drift::UpToDate { .. })
        ));
        assert!(matches!(
            Drift::decide(&managed, Some(&DriftLine::Remote(B.into()))),
            Some(Drift::Differs { .. })
        ));
    }

    #[test]
    fn no_substrate_means_no_drift_at_all() {
        let remote = DriftLine::Remote(A.into());
        assert_eq!(Drift::decide(&HostSubstrate::Absent, Some(&remote)), None);
        assert_eq!(Drift::decide(&HostSubstrate::Unknown, Some(&remote)), None);
    }

    #[test]
    fn every_failure_is_a_plain_words_cant_check() {
        let reason = |s: &HostSubstrate, l: Option<&DriftLine>| match Drift::decide(s, l) {
            Some(Drift::CantCheck { reason }) => reason,
            other => panic!("{other:?}"),
        };
        let dev = developer(Some(A));
        assert!(reason(&dev, Some(&DriftLine::NoDevTools)).contains("xcode-select --install"));
        assert!(reason(&dev, Some(&DriftLine::NoOrigin)).contains("`origin`"));
        assert_eq!(
            reason(
                &dev,
                Some(&DriftLine::Git("fatal: unable to access".into()))
            ),
            "`git ls-remote` failed: fatal: unable to access"
        );
        assert!(reason(&dev, Some(&DriftLine::Git(String::new()))).contains("no answer"));
        assert!(reason(&dev, None).contains("no answer"));
        assert!(
            reason(&developer(None), Some(&DriftLine::Remote(A.into()))).contains("HEAD"),
            "a remote HEAD with no local one is not a verdict"
        );
        let rootless = HostSubstrate::Developer {
            root: None,
            head: Some(A.into()),
        };
        assert!(reason(&rootless, Some(&DriftLine::Remote(A.into()))).contains("folder"));
    }

    #[test]
    fn the_drift_wire_shape_is_tagged() {
        assert_eq!(
            serde_json::to_value(Drift::Differs {
                head: A.into(),
                remote: B.into()
            })
            .unwrap(),
            serde_json::json!({"drift": "differs", "head": A, "remote": B})
        );
        assert_eq!(
            serde_json::to_value(Drift::CantCheck { reason: "x".into() }).unwrap(),
            serde_json::json!({"drift": "cant_check", "reason": "x"})
        );
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
