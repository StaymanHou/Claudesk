// M16.5 WP6 — the CodeMirror find/replace bar gets the same "no text assistance" as every
// other name/pattern input (`NO_TEXT_ASSIST`, M16.5 WP5).
//
// WP5 spread `NO_TEXT_ASSIST` onto every JSX `<input>`, but `@codemirror/search` builds its
// panel's DOM itself, so its `search` and `replace` fields never got it: macOS autocorrected a
// typed pattern exactly the way it used to rewrite the picker filter (operator report,
// 2026-11-02). There is no hook into the default panel's construction, so this listener stamps
// the attributes on after each view update, which is when a newly opened panel exists in the
// DOM. Idempotent and cheap: nothing to do while no panel is open.

import { EditorView } from "@codemirror/view";
import { NO_TEXT_ASSIST } from "../../noTextAssist";

/** `NO_TEXT_ASSIST`'s JSX props as the DOM attributes React would render (one source). */
export const NO_TEXT_ASSIST_ATTRS: [string, string][] = Object.entries(
  NO_TEXT_ASSIST,
).map(([prop, value]) => [prop.toLowerCase(), String(value)]);

/** Apply the attributes to every typed-text field inside `root`'s search panel(s). */
export function stampSearchPanel(root: ParentNode): void {
  for (const input of root.querySelectorAll<HTMLInputElement>(
    ".cm-search input",
  )) {
    if (input.type === "checkbox") continue;
    for (const [name, value] of NO_TEXT_ASSIST_ATTRS) {
      if (input.getAttribute(name) !== value) input.setAttribute(name, value);
    }
  }
}

/** Add to any editor that includes `search()` (directly or via `basicSetup`). */
export const searchPanelNoTextAssist = EditorView.updateListener.of((u) =>
  stampSearchPanel(u.view.dom),
);
