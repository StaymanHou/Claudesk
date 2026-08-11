---
name: rustdoc-link-to-a-nonexistent-test-fails-no-gate
description: A rustdoc intra-doc link to a test that does not exist passes cargo test, clippy -D warnings and fmt — so a doc comment can assert coverage that was never written; verify a cited test EXISTS with grep -c before crediting it.
metadata:
  type: reference
---

A doc comment can name a test as its evidence, that test can **not exist**, and **every gate still
passes**: `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `cargo fmt --check` all go
green, because a broken rustdoc intra-doc link is not an error by default.

Found 2026-08-07 (M12 WP4b Phase 2). `PtyCcSession::spawn`'s doc comment claimed
`[tests::the_cc_spawn_wires_the_gate_through_the_fail_closed_resolver]` *"guards that this receives
`cc_spawn_env`'s output rather than the shell-shared `color_tty_env` array."* The identifier's
**only occurrence in the entire crate was that citation** — and it claimed coverage of precisely the
caller property that was in fact unpinned.

⚠️ **This is a distinct failure class from a vacuous guard.** A vacuous guard *runs and proves
nothing*; this one **never ran at all**, while reading in prose as the strongest evidence in the
module. It is more dangerous than silence: an auditor greps for evidence, finds a confident
sentence, and stops.

**The check is one line:** `grep -rc "fn <test_name>" src/` — a total of **1** means only the
citation exists. Do this before crediting any test a comment names.

**Extends `[[verify-the-mutation-landed]]`**: that rule says confirm a mutation landed in
*executable* code; this adds **confirm a test cited as evidence EXISTS**.

**Mechanical fix available:** `#![deny(rustdoc::broken_intra_doc_links)]` (or `-D` in a CI doc step)
closes the whole class. ⚠️ It only fires on **bracketed** intra-doc syntax — a plain-prose mention
("guarded by `foo`") stays invisible, so pair it with the `grep -c` habit. Filed as
`SURFACE-2026-08-07-DOC-COMMENT-CITED-A-NONEXISTENT-TEST`. A sweep of existing `[`tests::` refs in
`src-tauri/src/` found no other dangles at the time of filing.

Related: [[verify-the-mutation-landed]],
[[raw-guard-identifier-satisfied-by-own-comments]],
[[extract-for-import-when-a-raw-guard-cant-express-the-property]].
