---
name: brew-cask-manual-delete-desync
description: "Why \"brew won't reinstall claudesk after I deleted the app\" happens, and the fix"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 3ed727fd-268b-43c7-9b65-82583fca4dde
---

Claudesk is distributed as a Homebrew cask (tap `StaymanHou/claudesk`). Homebrew tracks its own **install receipt** under `$(brew --caskroom)/claudesk`, independent of the filesystem.

If you delete `/Applications/Claudesk.app` **manually** (Finder/trash/`rm`), the receipt stays — so `brew install --cask claudesk` reports *"Not upgrading claudesk, the latest version is already installed"* and does nothing, leaving you with no app and no reinstall. brew never inspects whether the `.app` actually exists.

**Fix / correct habits:**
- Remove a cask app via `brew uninstall --cask claudesk` (keeps the receipt in sync), NOT Finder-delete.
- To recover from a desync: `brew uninstall --cask claudesk` (clears the stale receipt) → then reinstall.
- The full reinstall sequence is `brew trust --cask StaymanHou/claudesk/claudesk` → `brew install --cask claudesk` → `xattr -dr com.apple.quarantine /Applications/Claudesk.app`. The `brew trust` step is mandatory before install (recent Homebrew refuses untrusted third-party taps) and can get dropped during uninstall — re-run it if `install` errors *"Refusing to load cask … from untrusted tap"*.

Observed 2026-06-24 right after the v0.1.0 tap release. See the install docs in `README.md` → Install and `.claude/skills/release/SKILL.md`.
