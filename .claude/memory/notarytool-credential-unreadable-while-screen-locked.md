---
name: notarytool-credential-unreadable-while-screen-locked
description: "While the Mac screen is locked, `notarytool --keychain-profile claudesk-notary` reports \"No Keychain password item found\", which looks like a deleted credential but isn't. Ask the operator to unlock and re-check."
metadata:
  node_type: memory
  type: reference
  originSessionId: f7863f7e-21d8-49ab-bca6-50ca6ede4417
  modified: 2026-11-08T09:54:01.203Z
---

At `/release` preflight on 2026-11-08, `xcrun notarytool history --keychain-profile "claudesk-notary"` failed with
`Error: No Keychain password item found for profile: claudesk-notary`, both inside and outside the sandbox. I reported
the credential as "gone". That was wrong: the operator's screen was locked. After they unlocked, the same command
succeeded both inside and outside the sandbox.

**Why it misleads:** `security dump-keychain login.keychain-db` works while the screen is locked, and it shows NO
notarytool item even when the credential is fine. notarytool keeps its credential somewhere that dump does not list,
probably the data-protection keychain, which is unreadable while locked. So a "the login keychain has no notary item"
check is not evidence that the credential is missing.

**How to apply:** if the notary preflight fails with this error, first ask whether the screen is locked, and re-run
the check after an unlock. Never tell the operator to re-run `store-credentials` on this evidence alone. Run the
notarize step (`notarytool submit --wait`) while the operator is at the machine. Related: [[installed-build-verify-deferred-to-release]].
