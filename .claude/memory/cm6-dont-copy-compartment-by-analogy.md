---
name: cm6-dont-copy-compartment-by-analogy
description: Don't add a CM6 Compartment by analogy to fontSizeCompartment without checking the new case needs live reconfigure — an array-rebuild may already swap the value, making the compartment vestigial.
metadata:
  type: project
---

In this editor, the `@uiw/react-codemirror` `extensions` array is rebuilt (via `useMemo` deps) on any change, and `@uiw` applies the rebuilt array as a full CM6 reconfigure. So a value that changes on a React dep **is already swapped by the rebuild** — it does NOT need a `Compartment`.

WP3b copied the `fontSizeCompartment` pattern for the language override, but `fontSizeTheme` is genuinely live-`.reconfigure()`d (in `applyZoom`, no array rebuild) whereas the language is swapped by the `languageOverrideId` array rebuild — so `languageCompartment` is **vestigial** (`.of()`-seeded, never reconfigured) and its comments describe a reconfigure that isn't wired. (Auto-backlogged: SURFACE-2026-06-20-QUALITY-WP3B-VESTIGIAL-LANGUAGE-COMPARTMENT.)

**Rule:** before adding a CM6 `Compartment` by analogy to `fontSizeCompartment`, confirm the new case actually needs a _live reconfigure independent of the array rebuild_. If the value only changes via a React dep that's already in the `buildEditorExtensions` memo, the rebuild covers it — skip the compartment.
