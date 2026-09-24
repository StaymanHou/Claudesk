// F-b — the picker row's PROFILE line: the first line of the model cell's stack, above the model
// and drive-mode lines (operator, Phase 4 verify-human 2026-09-24: "a new row above the model
// selector and the drive mode selector … auto prefix it with 'Profile:'").
//
// ⚠️ Always prefixed, and always present (the line is lite-IDE core — not gated). A name that is
// not listed reads MISSING, never "default": the backend refuses that spawn, and the row must say
// why before the click.

import { resolveRowProfile, type Profile } from "../../state/profiles";

export const PROFILE_LINE_PREFIX = "Profile: ";

/** The built-in profile's display name on the line. */
export const DEFAULT_PROFILE_LABEL = "default";

export type ProfileLineKind = "default" | "listed" | "missing";

/** The profile line's text and state. Pure, so the wording is testable. */
export function profileLineText(
  reference: string | null,
  profiles: readonly Profile[],
): { readonly text: string; readonly kind: ProfileLineKind } {
  const state = resolveRowProfile(reference, profiles);
  switch (state.kind) {
    case "default":
      return {
        text: `${PROFILE_LINE_PREFIX}${DEFAULT_PROFILE_LABEL}`,
        kind: "default",
      };
    case "listed":
      return {
        text: `${PROFILE_LINE_PREFIX}${state.profile.name}`,
        kind: "listed",
      };
    case "missing":
      return {
        text: `${PROFILE_LINE_PREFIX}⚠ ${state.name} missing`,
        kind: "missing",
      };
  }
}

/**
 * F-b Phase 5 — the `Profile:` select's "New profile…" entry. It opens the wizard and is NEVER
 * committed as a value: `:` is outside the profile-name alphabet (`profiles::validate_name`), so
 * no listed profile can ever collide with it.
 */
export const NEW_PROFILE_OPTION = "::new-profile";
export const NEW_PROFILE_LABEL = "New profile…";
