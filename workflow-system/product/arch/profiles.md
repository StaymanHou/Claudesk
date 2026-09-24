---
updated: 2026-09-24  # F-b shipped (5 phases, feature-finalize). First as-built write.
---

# Claude Code profiles (F-b)

A **profile** is a named `CLAUDE_CONFIG_DIR`. Each picker row names one, and its workspace's Claude
Code session runs under it. The built-in profile **`default`** means *no* `CLAUDE_CONFIG_DIR`
(`~/.claude`). It is never stored and can be neither removed nor deleted. Spec, rulings and the
per-phase record are in `workflow-system/state/archive/f-b-isolated-cc-profiles.md`; the four
grill rulings are in `roadmap.md` → "F-b decisions — `/util-grill-me`, 2026-09-23".

⚠️ **Lite-IDE core — NOT gated** on `workflow_features_enabled`. The profile line and the Settings
Profiles group exist with the gate OFF.

## Storage

- **The profile list** is `profiles.json` in the app-data dir, per identity (dev and prod each keep
  their own). It is its own file, **not** a field of `AppSettings`: settings deserialize in one shot,
  so one bad profile would take every setting down. The top level must be an array (anything else is
  refused, never wiped). **Each entry parses on its own**, and a bad or duplicate one is dropped with
  a log line (`profiles::read_profiles`). All writes go through `profiles::update_profiles` under
  the shared config lock.
- **A row's reference** is `projects.json` `profile` (a name). Absent means default, and the key is
  omitted, so untouched files are byte-identical. An unlisted name degrades **that row**, never the
  whole list read.
- **Provenance** `created | adopted` decides what Claudesk may do to the directory. ⚠️ **Only a
  `created` profile may be moved to the Trash.**

## Resolution — fail closed, never fall back

`profiles::resolve` → `Default | Listed | Missing`. ⚠️ **`Missing` is never folded into `Default`.**
A silent fallback would run the session under the wrong `CLAUDE.md`, permissions and memory, with
nothing on screen to say so. So:

- the spawn refuses (`resolve_spawn_profile`, run first in `SessionRegistry::spawn`, before the
  unclean-exit flag is consumed and before a PTY opens);
- the picker refuses the open, with a toast naming the profile (`missingProfileRefusal`);
- the row reads `Profile: ⚠ <name> missing`.

`profiles::is_default_reference` is the one Rust definition of "default" (absent / blank /
`"default"`). `isDefaultProfile` (`src/state/workflowApplicable.ts`) mirrors it.

## Spawning under a profile

- **Env**: `CLAUDE_CONFIG_DIR=<dir>` is set through `cc_spawn_env`, with no shell function, wrapper
  or login-shell indirection (that indirection was blocker 1 of the original ask). A **default** row
  **removes** `CLAUDE_CONFIG_DIR` explicitly, so an inherited value can never move a default
  session into a profile. `CC_SPAWN_ENV_REMOVE` / `SHELL_SPAWN_ENV_REMOVE` also strip an inherited
  `CLAUDESK_DRIVE_MODE`. That was a pre-existing leak into dev-inside-prod dogfooding, fixed here.
  `compose_command` makes the child env testable as a value.
- **Argv**: ⚠️ **a non-default profile gets NO `--permission-mode`** (operator ruling, 2026-09-23;
  `spawn_permission_mode` + `build_cc_argv`), so the profile's own `permissions.defaultMode` governs.
  The app-global permission mode applies to the default profile only, and the Settings permission
  control says so. The model cell's "inherit" passes no `--model`, so CC resolves the profile's own
  default.
- **`--continue`** degrades to a fresh spawn when `<config_root>/projects/<slug>/` holds no
  transcript. Measured: CC otherwise prints "No conversation found to continue" and **exits**.
  **Changing a row's profile clears its unclean-exit flag** (`apply_project_profile`).

## The workflow layer is ALWAYS off for non-default profiles (ruling 4)

`workflow_applicable(gate, profile)` = gate ON ∧ default profile. Its TS mirror is
`isWorkflowApplicable`. ⚠️ **Every consumer scoped to one project or session reads THIS, never the
raw gate**: the spawn's `CLAUDESK_DRIVE_MODE`, the picker's `/session-restore` announce arm, the
drive-mode line, the skill row, and the supervisor. The frontend takes the profile from the **live
session** once one exists (`useWorkspaceProfile` → `cc_session_profile`), and from the stored row
before that. The OFF-invariant pin is unchanged at 6 arms / 9 subjects. Profile-scoped suppression
has its own caller guard (`workflowApplicableGuard.test.ts`).

## Status channel — persistent per-profile hook registration (ruling 3)

`hook_install::install_on_launch` registers into `~/.claude/settings.json` first (unchanged, and still
the function's result). It then registers into **every listed profile's** `<dir>/settings.json` via
`install_into_profiles`, using the same additive, marker-scoped merge. It is self-healing (a
hand-deleted entry comes back), and one failing profile never stops the others or masks the
`~/.claude` result. ⚠️ **A profile whose dir is gone is skipped, never recreated**: writing a
`settings.json` would mint a directory the operator deleted.

- **Adopt** (`adopt_registered`): list the dir, then register. If registration fails, the adoption is
  rolled back, because a listed profile Claudesk cannot see the status of is worse than none. It
  writes nothing else into the dir.
- **Remove** (`remove_unregistered`): unregister **only this build's** entries first, and drop the
  entry only if that succeeds. Dev and prod markers are independent.
- Routing is still by `cwd`, and a profile changes nothing about it. The known cross-talk (a
  bare-terminal session in an open workspace's dir lights its dot) is inherited, not fixed.

## Transcript reader follows the config root

`transcript_dir_for` takes a config root. `config_root_for_project` resolves it: a listed profile
gives its dir, default gives `~/.claude`, and unlisted or unreadable gives `None`, **never home**.
The slug rule is unchanged. ⚠️ **Known gap
(`SURFACE-2026-09-24-QUALITY-TRANSCRIPT-ROOT-READS-STORED-PROFILE-NOT-LIVE`):** this resolves from
the **stored** row profile, while the workflow gate follows the **live** session. After a
mid-session profile change the two disagree.

## Create (the wizard) and Delete-to-Trash

- **Wizard** (`NewProfileWizard.tsx` over the pure `profileWizardModel.ts`). ⚠️ The model is **not**
  `newProfileWizard.ts`: that name collides case-insensitively with the component on macOS. It is
  reached from Settings → Profiles **New profile…** and from the picker `Profile:` select's
  **New profile…** entry. That entry's sentinel is `::new-profile`, outside the name alphabet, and
  is never committed. A profile created from a row is committed to that row. Steps, in order: name →
  dir (`~/.config/claude-<name>`) → permission mode (**always a step**, pre-selected from
  `~/.claude` `permissions.defaultMode`) → retention (`99999`) → model (optional) → theme + status
  line (pre-filled from `~/.claude` at open) → mouse tracking + copy-on-select (both **OFF**) →
  confirm.
- **`profile_create::create`** refuses an invalid or taken name, an unknown theme, a relative path,
  and a **non-empty or not-a-directory** target (offering "add it as an existing config dir
  instead"). An existing **empty** dir is accepted. It writes via tmp + rename, registers the hook,
  then lists the profile as `created`. **Any failure** removes the seeded files, and the dir too
  when this call made it. ⚠️ No code path touches `~/.zshrc` (guarded over the module's code lines).
  ⚠️ **Known gap (`…-QUALITY-PROFILE-CREATE-MISSES-THE-ALREADY-LISTED-DIR-CHECK`):** `create` does
  not refuse an already-listed dir, as `adopt` does. It is latent, because an adopted dir holds the
  hook's `settings.json` and so is non-empty.
- **Where each seeded value lives** (probe P1.1, CC 2.1.281; do NOT re-derive):

  | Value | File | Note |
  |---|---|---|
  | `theme` | `settings.json` | a `.claude.json` theme is **stripped at startup** |
  | `copyOnSelect` | `<dir>/.claude.json` | CC merges into a pre-seeded file |
  | mouse tracking OFF | `settings.json` `env.CLAUDE_CODE_DISABLE_MOUSE="1"` | no settings key exists |
  | `statusLine` | `settings.json` | verbatim from `~/.claude/settings.json`, snapshotted at create |
  | `cleanupPeriodDays`, `permissions.defaultMode`, `model` | `settings.json` | |
  | the "Never touch `~/.claude/`" guard | `<dir>/CLAUDE.md` | the boilerplate's section, dir substituted |

  ⚠️ **Never seed `hasCompletedOnboarding`**: it also skips CC's own login step. The cost of not
  seeding it is one Enter on CC's theme picker (already on Dark). `skipDangerousModePermissionPrompt`
  is not seeded either, so a bypass profile shows CC's warning once.
- **Delete** (`profile_create::delete_created`, behind `async profile_delete` + `spawn_blocking` →
  `trash::delete`). It refuses `adopted`. The Trash move happens **first**, and the entry is dropped
  only on success. A dir that is already gone just drops the entry. No hook teardown is needed,
  because the registration goes with the dir. Settings shows **Delete…** only for `created` rows.
  The confirm names the dir and says history and memory go with it, with focus on Cancel.

## Esc inside a stacked dialog

App.tsx's overlay Esc handler is a **document capture** listener, so a React `onKeyDown` in a dialog
stacked over Settings loses the race, and one Esc closes Settings together with the dialog.
`useEscCapture` registers a **window capture** listener instead, which runs first. That keeps one Esc
to one layer. It is used by the wizard and the Delete confirm, and pinned by live tests against an
App-style document listener. This is **not** an app-level overlay, so it does not belong in
`escDismiss.ts`'s table.

## Deferred to the `/release` gate

From a Finder-launched **installed** `.app`: a profile spawn plus its status dot, and whether
`trash::delete` (Finder-backed on macOS) needs an Automation grant there.
