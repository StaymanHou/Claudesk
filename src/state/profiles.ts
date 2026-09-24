// F-b — the frontend's typed IPC surface for profiles (named `CLAUDE_CONFIG_DIR`s).
//
// Mirrors `config_store::profiles::Profile` and the profile commands in
// `config_store/commands.rs`. The built-in `"default"` profile is never in the list — the UI
// renders it itself (see `DEFAULT_PROFILE` in ./workflowApplicable.ts).

import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_PROFILE } from "./workflowApplicable";
import type { CcPermissionMode } from "../cc/permissionMode";

/** Broadcast by the backend after a profile is adopted or removed. Payload: none. */
export const PROFILES_CHANGED_EVENT = "profiles-changed";

/** Rust `profiles::Provenance`. Only a `created` profile may be moved to the Trash. */
export type ProfileProvenance = "created" | "adopted";

/** Rust `profiles::Profile`. `name` IS the id a `projects.json` row stores. */
export interface Profile {
  readonly name: string;
  readonly config_dir: string;
  readonly provenance: ProfileProvenance;
}

export async function listProfiles(): Promise<Profile[]> {
  return invoke<Profile[]>("profiles_list");
}

/**
 * Adopt an existing directory. Registers Claudesk's hook in its `settings.json`; if that fails
 * the adoption is rolled back and this rejects. `name: null` derives one (`claude-neo` → `neo`).
 */
export async function adoptProfile(
  configDir: string,
  name: string | null = null,
): Promise<Profile> {
  return invoke<Profile>("profile_adopt", { configDir, name });
}

/** Remove from Claudesk, KEEP the directory. Unregisters the hook first. */
export async function removeProfile(name: string): Promise<void> {
  return invoke<void>("profile_remove", { name });
}

/** `~/.config/claude-*` directories not yet listed. */
export async function adoptionSuggestions(): Promise<string[]> {
  return invoke<string[]>("profile_adoption_suggestions");
}

/**
 * Point a project row at a profile (`null` / `"default"` = the default profile). Rejects for an
 * unlisted name. A CHANGE clears the row's unclean-exit flag backend-side.
 */
export async function setProjectProfile(
  projectPath: string,
  profile: string | null,
): Promise<void> {
  return invoke<void>("set_project_profile", { path: projectPath, profile });
}

/** What a row's stored reference resolves to against the listed profiles. */
export type RowProfileState =
  | { readonly kind: "default" }
  | { readonly kind: "listed"; readonly profile: Profile }
  | { readonly kind: "missing"; readonly name: string };

/**
 * Mirror of Rust `profiles::resolve` for the picker row. ⚠️ A name that is not listed is
 * `missing` — NEVER `default`: the backend refuses that spawn, and the row must say why before
 * the click rather than after.
 */
export function resolveRowProfile(
  reference: string | null | undefined,
  profiles: readonly Profile[],
): RowProfileState {
  const name = (reference ?? "").trim();
  if (name === "" || name === DEFAULT_PROFILE) return { kind: "default" };
  const profile = profiles.find((p) => p.name === name);
  return profile ? { kind: "listed", profile } : { kind: "missing", name };
}

/**
 * F-b A.6 — the picker's open-time refusal for a row naming an unlisted profile, or `null` when
 * the row may open. Pure so the refusal is testable (no test renders `ProjectPicker`); the
 * picker shows this as an error toast and mints NO workspace.
 */
export function missingProfileRefusal(
  reference: string | null | undefined,
  profiles: readonly Profile[],
): string | null {
  const state = resolveRowProfile(reference, profiles);
  return state.kind === "missing"
    ? `This project runs under the profile "${state.name}", which is no longer in Claudesk's profile list. Pick a profile for it first.`
    : null;
}

// ---------------------------------------------------------------------------
// F-b Phase 5 — the New-profile wizard + Delete-to-Trash
// ---------------------------------------------------------------------------

/** Rust `profile_create::WizardDefaults` — a snapshot of `~/.claude` taken when the wizard opens. */
export interface WizardDefaults {
  /** `~/.config`; the default dir is `<config_root>/claude-<name>`. */
  readonly config_root: string;
  readonly permission_mode: CcPermissionMode;
  readonly cleanup_period_days: number;
  readonly theme: string;
  /** `~/.claude/settings.json`'s `statusLine`, verbatim, or `null` when it has none. */
  readonly status_line: unknown;
  readonly themes: readonly string[];
}

/** Rust `profile_create::NewProfileSpec` — the wire contract of `profile_create`. */
export interface NewProfileSpec {
  readonly name: string;
  readonly config_dir: string;
  readonly permission_mode: CcPermissionMode;
  readonly cleanup_period_days: number;
  readonly model: string | null;
  readonly theme: string;
  readonly copy_status_line: boolean;
  readonly mouse_tracking: boolean;
  readonly copy_on_select: boolean;
}

/** Rust `profile_create::DirStatus`. */
export type DirStatus = "absent" | "empty" | "nonEmpty" | "notADirectory";

export async function profileWizardDefaults(): Promise<WizardDefaults> {
  return invoke<WizardDefaults>("profile_wizard_defaults");
}

export async function profileDirStatus(path: string): Promise<DirStatus> {
  return invoke<DirStatus>("profile_dir_status", { path });
}

/** Seed the dir, register the hook, list it as `created`. Rolled back backend-side on failure. */
export async function createProfile(spec: NewProfileSpec): Promise<Profile> {
  return invoke<Profile>("profile_create", { spec });
}

/** Move a `created` profile's dir to the macOS Trash and drop it. Rejects for `adopted`. */
export async function deleteProfile(name: string): Promise<void> {
  return invoke<void>("profile_delete", { name });
}
