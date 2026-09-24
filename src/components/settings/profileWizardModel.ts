// F-b Phase 5 — the New-profile wizard's pure model: step order, the draft, per-step validation,
// and the draft → `NewProfileSpec` mapping. No React, no IPC, so every rule here is testable as a
// value (the component in NewProfileWizard.tsx only renders it and calls the backend).
//
// ⚠️ The backend (`config_store::profile_create::create`) is the AUTHORITY on every refusal. The
// checks here only let the wizard say so at the step the operator is on, before the confirm.

import type { ConfirmSpec } from "../workspace/editor/confirmDialog";
import type { CcPermissionMode } from "../../cc/permissionMode";
import { DEFAULT_PROFILE } from "../../state/workflowApplicable";
import type {
  NewProfileSpec,
  Profile,
  WizardDefaults,
} from "../../state/profiles";

/**
 * Spec D.18's step order. ⚠️ `permission` is ALWAYS a step, with a value pre-selected. It is
 * never skipped, even when the default is fine, because the boilerplate's rule is that silence is
 * not a gate.
 */
export const WIZARD_STEPS = [
  "name",
  "dir",
  "permission",
  "retention",
  "model",
  "appearance",
  "input",
  "confirm",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const STEP_TITLES: Record<WizardStep, string> = {
  name: "Name",
  dir: "Config directory",
  permission: "Permission mode",
  retention: "Log retention",
  model: "Default model",
  appearance: "Theme and status line",
  input: "Mouse and selection",
  confirm: "Confirm",
};

/** CC's theme labels (CC 2.1.281's own wording); an unknown value shows as itself. */
export const THEME_LABELS: Readonly<Record<string, string>> = {
  auto: "Auto (match terminal)",
  dark: "Dark mode",
  light: "Light mode",
  "dark-daltonized": "Dark mode (colorblind-friendly)",
  "light-daltonized": "Light mode (colorblind-friendly)",
  "dark-ansi": "Dark mode (ANSI colors only)",
  "light-ansi": "Light mode (ANSI colors only)",
};

export interface WizardDraft {
  readonly name: string;
  readonly configDir: string;
  /** Once the operator edits the dir, it stops following the name. */
  readonly dirEdited: boolean;
  readonly permissionMode: CcPermissionMode;
  /** Kept as typed text so a half-typed value is representable; parsed by `toSpec`. */
  readonly cleanupPeriodDays: string;
  readonly model: string;
  readonly theme: string;
  readonly copyStatusLine: boolean;
  /** Pre-set OFF (operator, spec review 2026-09-23). */
  readonly mouseTracking: boolean;
  /** Pre-set OFF (operator, spec review 2026-09-23). */
  readonly copyOnSelect: boolean;
}

/** The boilerplate's convention: `~/.config/claude-<name>`. */
export function defaultConfigDir(configRoot: string, name: string): string {
  return `${configRoot.replace(/\/+$/, "")}/claude-${name}`;
}

export function initialDraft(defaults: WizardDefaults): WizardDraft {
  return {
    name: "",
    configDir: defaultConfigDir(defaults.config_root, ""),
    dirEdited: false,
    permissionMode: defaults.permission_mode,
    cleanupPeriodDays: String(defaults.cleanup_period_days),
    model: "",
    theme: defaults.theme,
    copyStatusLine: defaults.status_line != null,
    mouseTracking: false,
    copyOnSelect: false,
  };
}

/** Set the name. The dir follows it until the operator has edited the dir themselves. */
export function withName(
  draft: WizardDraft,
  name: string,
  configRoot: string,
): WizardDraft {
  return {
    ...draft,
    name,
    configDir: draft.dirEdited
      ? draft.configDir
      : defaultConfigDir(configRoot, name),
  };
}

/** Mirror of Rust `profiles::validate_name`, plus the collision check (D.19). */
export function nameError(
  name: string,
  listedNames: readonly string[],
): string | null {
  if (name === DEFAULT_PROFILE)
    return `"${DEFAULT_PROFILE}" is the built-in profile's name.`;
  if (name.length === 0) return "Enter a name.";
  if (name.length > 40) return "A profile name must be 1–40 characters.";
  if (name.startsWith("-")) return 'A profile name cannot start with "-".';
  if (!/^[a-z0-9-]+$/.test(name))
    return 'A profile name may use only a–z, 0–9 and "-".';
  if (listedNames.includes(name))
    return `A profile named "${name}" already exists.`;
  return null;
}

export function retentionError(text: string): string | null {
  return /^[1-9][0-9]{0,8}$/.test(text.trim())
    ? null
    : "Enter a whole number of days (1 or more).";
}

export function dirError(dir: string): string | null {
  return dir.startsWith("/") ? null : "Enter an absolute path.";
}

/**
 * The error that blocks leaving `step`, or `null`. The dir step's non-empty check needs the
 * filesystem, so the component adds it on top of this (via `profile_dir_status`).
 */
export function stepError(
  step: WizardStep,
  draft: WizardDraft,
  listedNames: readonly string[],
): string | null {
  switch (step) {
    case "name":
      return nameError(draft.name, listedNames);
    case "dir":
      return dirError(draft.configDir);
    case "retention":
      return retentionError(draft.cleanupPeriodDays);
    default:
      return null;
  }
}

export function nextStep(step: WizardStep): WizardStep {
  const i = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[Math.min(i + 1, WIZARD_STEPS.length - 1)];
}

export function prevStep(step: WizardStep): WizardStep {
  const i = WIZARD_STEPS.indexOf(step);
  return WIZARD_STEPS[Math.max(i - 1, 0)];
}

export function toSpec(draft: WizardDraft): NewProfileSpec {
  const model = draft.model.trim();
  return {
    name: draft.name,
    config_dir: draft.configDir,
    permission_mode: draft.permissionMode,
    cleanup_period_days: Number.parseInt(draft.cleanupPeriodDays.trim(), 10),
    model: model === "" ? null : model,
    theme: draft.theme,
    copy_status_line: draft.copyStatusLine,
    mouse_tracking: draft.mouseTracking,
    copy_on_select: draft.copyOnSelect,
  };
}

/**
 * The status line as the operator should read it: a `command` line's command text, otherwise the
 * JSON. ⚠️ Shown so a command that points back into `~/.claude/…` is visible before it is copied.
 */
export function statusLineText(value: unknown): string | null {
  if (value == null) return null;
  if (
    typeof value === "object" &&
    (value as { type?: unknown }).type === "command" &&
    typeof (value as { command?: unknown }).command === "string"
  ) {
    return (value as { command: string }).command;
  }
  return JSON.stringify(value);
}

export type DeleteChoice = "delete" | "cancel";

/**
 * F-b D.24 — the Delete confirm. It names the directory and says that history and memory go
 * with it. Esc → cancel.
 */
export function deleteProfileConfirmSpec(
  profile: Profile,
): ConfirmSpec<DeleteChoice> {
  return {
    title: `Delete the profile "${profile.name}"?`,
    message: `${profile.config_dir} will be moved to the Trash, and its conversation history, memory, settings and login go with it. Projects that use this profile will refuse to open until you pick another one.`,
    buttons: [
      { id: "cancel", label: "Cancel", value: "cancel" },
      {
        id: "delete",
        label: "Move to Trash",
        value: "delete",
        variant: "danger",
      },
    ],
    escValue: "cancel",
  };
}
