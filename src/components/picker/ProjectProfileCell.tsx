// F-b — the per-row PROFILE cell on the project picker: which `CLAUDE_CONFIG_DIR` this project
// spawns under. Sits beside the model / drive-mode cell (operator, grill 2026-09-23).
//
// ⚠️ **Lite-IDE core — NOT gated on `workflow_features_enabled`** (spec A.5). A profile is a
// Claude Code concept, not a companion-workflow one, so this module deliberately does not read
// the gate at all.
//
// ⚠️ **A closed-set native `<select>`**, per the drive-mode precedent — NOT the model cell's
// open-string input. The value must be a listed profile (or the default), and the backend
// refuses an unlisted name.
//
// ⚠️ **A name that is not listed renders as MISSING, never as "default"** (spec A.6). The
// backend refuses that spawn; the row says why BEFORE the click.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveRowProfile,
  setProjectProfile,
  type Profile,
} from "../../state/profiles";
import { commitCellValue } from "./commitCellValue";
import { CellValueLine } from "./ProjectModelCell";

/** The label the cell shows for the built-in profile. */
export const DEFAULT_PROFILE_LABEL = "default";

interface ProjectProfileCellProps {
  projectPath: string;
  /** Human label for this project, used only in the a11y names. */
  projectLabel: string;
  /** The row's stored reference, as `list_projects` returned it (`null` = default). */
  seedProfile: string | null;
  /** The listed profiles, read ONCE by the picker (never per row). */
  profiles: readonly Profile[];
  /** A successfully-persisted change, so the parent can fold it into `recents`. */
  onCommitted?: (projectPath: string, profile: string | null) => void;
}

/** What the resting line says. Pure, so the missing/default/listed wording is testable. */
export function profileCellText(
  reference: string | null,
  profiles: readonly Profile[],
): { text: string; kind: "default" | "listed" | "missing" } {
  const state = resolveRowProfile(reference, profiles);
  switch (state.kind) {
    case "default":
      return { text: DEFAULT_PROFILE_LABEL, kind: "default" };
    case "listed":
      return { text: state.profile.name, kind: "listed" };
    case "missing":
      return { text: `⚠ ${state.name} missing`, kind: "missing" };
  }
}

export function ProjectProfileCell({
  projectPath,
  projectLabel,
  seedProfile,
  profiles,
  onCommitted,
}: ProjectProfileCellProps) {
  const [profile, setProfile] = useState<string | null>(seedProfile);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const profileRef = useRef<string | null>(seedProfile);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  const commit = useCallback(
    (next: string | null) => {
      setEditing(false);
      void commitCellValue<string | null>({
        next,
        persisted: profileRef.current,
        changed: (a, b) => (a ?? null) !== (b ?? null),
        persist: (value) => setProjectProfile(projectPath, value),
        apply: setProfile,
        setRef: (value) => {
          profileRef.current = value;
        },
        setFailed,
        notifyCommitted: (value) => onCommitted?.(projectPath, value),
        what: "profile",
      });
    },
    [projectPath, onCommitted],
  );

  const line = profileCellText(profile, profiles);
  const missingName = line.kind === "missing" ? (profile ?? "").trim() : null;
  const title =
    line.kind === "missing"
      ? `This project names the profile "${missingName}", which is not in Claudesk's profile list. Opening it is refused until you pick a profile.`
      : failed
        ? "Saving the profile failed — the previous value is still in effect."
        : "The Claude Code profile (CLAUDE_CONFIG_DIR) this project starts under. Takes effect on the next session.";

  return (
    <div
      className={`picker-recent-profile${editing ? " is-editing" : ""}`}
      data-testid="project-profile-cell"
      // A click anywhere in the cell must never reach the row's open-project button.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {editing ? (
        <select
          ref={selectRef}
          className="picker-recent-profile-select"
          data-testid="project-profile-select"
          value={profile ?? ""}
          aria-label={`Claude Code profile for ${projectLabel}`}
          title={title}
          onChange={(e) =>
            commit(e.target.value === "" ? null : e.target.value)
          }
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
        >
          <option value="">{DEFAULT_PROFILE_LABEL}</option>
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
          {/* The stored-but-unlisted value must stay representable, or the select would
              silently show "default" for a row that the backend will refuse. */}
          {missingName !== null && (
            <option value={missingName} disabled>
              {missingName} (missing)
            </option>
          )}
        </select>
      ) : (
        <CellValueLine
          testId="project-profile-line"
          className={`picker-recent-cell-line${line.kind === "default" ? "" : " is-set"}${failed || line.kind === "missing" ? " is-failed" : ""}`}
          label={`Claude Code profile for ${projectLabel}: ${line.text}. Click to change.`}
          title={title}
          text={line.text}
          onActivate={() => setEditing(true)}
        />
      )}
    </div>
  );
}
