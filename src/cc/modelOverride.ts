// M11.5 WP1 — per-project CC model override (the pure core).
//
// A project may pin the model its CC session spawns with (`--model <value>`); unset means
// inherit whatever CC itself is configured to use. The operator's framing: the global CC
// default means you forget to switch models back after using one on a project, so the
// choice should follow the project rather than the machine.
//
// This module is the pure (no React / no Tauri IPC) core — the normalization rule and the
// alias hints — so both are vitest-pinnable without a running app. The wire calls live in
// `modelOverrideIpc.ts`. Same split as `permissionMode.ts` / `permissionModeIpc.ts`.
//
// ## The one rule worth internalizing: this module does NOT validate.
//
// `claude --help` documents an OPEN value set — "Provide an alias for the latest model
// (e.g. 'fable', 'opus', or 'sonnet') or a model's full name (e.g. 'claude-fable-5')" —
// and a WP1 probe confirmed that an unusable value fails INSIDE CC, loudly and precisely:
//
//   "There's an issue with the selected model (<value>). It may not exist or you may not
//    have access to it. Run --model to pick a different model."
//
// The PTY spawn itself still succeeds, so that message lands in the terminal pane the
// operator is already looking at. CC's check is strictly better than anything Claudesk
// could do — it knows about entitlements, not merely existence — and any allowlist here
// would reject models released after this build shipped. So: forward verbatim, let CC
// adjudicate. Do NOT add a validator to this module.

/**
 * Model aliases `claude --help` documents, offered as **input hints only**.
 *
 * ⚠️ NOT a validation allowlist and NOT an exhaustive list of valid values — see the
 * module header. These populate a `<datalist>` so the common cases are one keystroke away,
 * while any other value (a full model ID, or an alias added by a future CC release)
 * remains typeable. Rejecting a value because it is absent here would reintroduce exactly
 * the rot this design avoids.
 */
export const MODEL_ALIAS_HINTS: readonly string[] = ["fable", "opus", "sonnet"];

/** Placeholder shown in the EDIT field when a project has no override. */
export const MODEL_UNSET_PLACEHOLDER = "Default (CC's own)";

/**
 * Compact label shown on the picker ROW when a project has no override.
 *
 * Deliberately shorter than {@link MODEL_UNSET_PLACEHOLDER} — the row is a scannable
 * column where brevity matters, while the edit field has space to be explicit about *whose*
 * default it means. **Derived from the placeholder rather than written out again** so a copy
 * change to one cannot silently leave the other stale (they were two independent hardcoded
 * strings until code review caught it).
 *
 * ⚠️ **The brevity rationale above assumed ONE value per row, which stopped being true at
 * M12 WP4c.** The cell now stacks two lines (model over drive mode), and two bare values
 * read as `Default` over `None` with nothing saying which line is which. So when the value
 * is unset **and** the workflow gate is on, the row prefixes this label — rendering
 * `Model: Default` — via `MODEL_LINE_PREFIX` in `cc/driveMode.ts`. The constant itself is
 * unchanged; what changed is that the *row* may now decorate it.
 *
 * Brevity still governs the case this comment was written for: with the gate **off** the
 * cell is a single line and renders this label bare, byte-identically to the pre-M12 build.
 * ⚠️ Do NOT "simplify" the prefixing away as redundant — it is the only thing distinguishing
 * the two stacked lines, and `Drive Mode: None` fits the column with just 2.4px of headroom
 * (the column was widened to `9.8em` specifically to afford both prefixes). See WBS
 * Verdict (f) and `SURFACE-2026-08-06-STACKED-CELL-LABELS-REVISE-THE-MODEL-UNSET-BREVITY-RATIONALE`.
 */
export const MODEL_UNSET_LABEL = MODEL_UNSET_PLACEHOLDER.split(" (")[0];

/**
 * Normalize a raw input value into what should be persisted.
 *
 * Trims surrounding whitespace, and maps blank-or-whitespace-only to `null` (= clear the
 * override / inherit CC's default). `null` rather than `""` because the backend field is
 * `Option<String>`: an empty string would persist as a present-but-empty override and
 * become an argv token CC rejects, whereas `null` removes the key entirely.
 *
 * The Rust side applies the SAME rule twice more (`set_default_model` on write,
 * `build_cc_argv` on read) — deliberately redundant, so a hand-edited `projects.json` or
 * a value written by an older build can never reach CC as `--model "   "`.
 */
export function normalizeModelValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The string to display in the control for a persisted value.
 *
 * `null` (unset) renders as the empty string so the input shows its placeholder rather
 * than literal text the operator would have to clear before typing.
 */
export function displayModelValue(model: string | null): string {
  return model ?? "";
}

/**
 * Whether committing `raw` would actually change the persisted value.
 *
 * Used to suppress a redundant IPC write when the operator focuses the field and blurs it
 * without editing, or re-types the value already stored — a blur is a very easy gesture to
 * perform accidentally, and a no-op write would still re-persist the whole project list.
 */
export function modelValueChanged(
  raw: string,
  persisted: string | null,
): boolean {
  return normalizeModelValue(raw) !== persisted;
}
