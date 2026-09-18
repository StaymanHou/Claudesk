---
name: release-is-three-artifacts-verify-each
description: A Claudesk release is THREE artifacts (.app, .dmg, .app.tar.gz payload) derived at different pipeline stages; verifying two says nothing about the third, and the payload is the one users actually receive.
metadata:
  type: project
---

A Claudesk release publishes **three** artifacts, and they are **not** copies of one another — each
is derived at a different pipeline stage, so a property proven on one does **not** transfer:

| Artifact | Who receives it | Derived when |
|---|---|---|
| `Claudesk.app` | nobody directly (it is the input) | signed at build |
| `Claudesk_<v>_aarch64.dmg` | first-install / Homebrew | wrapped at build, notarized+stapled after |
| `Claudesk.app.tar.gz` | ⚠️ **every self-updating user** | tarred **during** the build |

⚠️ **The trap, hit for real on the v0.5.2 cut (2026-09-18):** Tauri creates the tarball *during*
`tauri build`, i.e. **before** any post-build `stapler staple` runs. So the payload contained an
**unstapled** `.app` and its minisign `.sig` covered stale bytes — while `codesign`, `spctl` and
`stapler validate` on the `.app` and `.dmg` all reported clean. A user self-updating into it would
get an app whose Gatekeeper check must fetch the ticket **online**, failing offline.

**The verification gate had the same blind spot as the pipeline** — it read the two artifacts that
are easy to reach and never extracted the one that ships. Three green checks, wrong release.

**The transferable rule:** in a multi-artifact publish, **enumerate what a consumer can actually
receive and verify EACH** — not the most convenient representative. When artifact B is derived from
artifact A at a different stage, a check on A is evidence about A only.

**How to apply here:**
- `/release` step 3d has **four** checks; check 4 extracts `Claudesk.app.tar.gz` and runs
  `stapler validate` + `spctl` on the extracted `.app`. Do not drop it, and do not assume the `.app`
  check covers it.
- The ordering `staple → re-tar → re-sign` is load-bearing (`/release` step 3c). Re-tarring
  invalidates the `.sig`, so the re-sign is mandatory, not optional.
- ⚠️ `cp -R` **strips a notarization ticket** (xattrs do not survive a plain copy → `spctl` rejects
  as `source=Unnotarized Developer ID`). `tar` and `ditto` preserve it — which is the only reason
  the updater's own install path (`tar::Archive::unpack` + `rename`) is safe.
- Verify against the **downloaded** artifact, not the local build, when the question is "what do
  users get?"

Related: [[never-propose-brew-upgrade-to-verify-a-release]] (the install side of the same pipeline),
[[verify-self-stub-cannot-cross-subprocess-boundary]] (same shape: the thing you can reach is not
the thing that ships).
