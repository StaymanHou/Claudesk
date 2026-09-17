// M14 WP3 Phase 1 — the reachability guard for the chord registry.
//
// ⚠️ THIS IS THE LOAD-BEARING TEST OF THE WHOLE WP, and the reason is specific:
// enumerating a registry as data proves the SET exists. It does NOT prove each entry has a
// CALLER. That exact gap shipped a CRITICAL at M11 WP4 and the M12 dead-`/exit` before it,
// and CLAUDE.md flags it twice ("extracting a pure state machine proves the MACHINE, not its
// CALLER"). A registry of 20 chords that all render beautifully in Settings while three of
// them are wired to nothing is the failure this file exists to catch.
//
// So the assertions below are deliberately NOT "the registry has 20 entries" or "every entry
// has a label". They are:
//   (1) every Claudesk-owned entry names a matcher module that EXISTS on disk;
//   (2) that module is actually IMPORTED by a real registration host (see HOSTS below) —
//       i.e. something can call it;
//   (3) the host actually CALLS it — the imported symbol appears in call position, not just
//       in the import line. An import with no call site is precisely the dead-registry shape.
//
// ⚠️ Assertion (3) reads host source with comments STRIPPED. That is not incidental: the
// thing this WP replaced was a ~60-line COMMENT BLOCK naming every chord and every predicate
// (`isFinderChord`, `panelForChord`, …). A guard that grepped raw source for a bare
// identifier would be satisfied by the very comments being deleted, and would keep passing
// after the code was gone — the documented `raw-guard-identifier-satisfied-by-own-comments`
// trap, at its most dangerous here of all places. We strip comments, then assert the CALL
// shape `fn(`.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { CHORD_REGISTRY, visibleChords, chordLabel } from "../chordRegistry";

const SRC = resolve(__dirname, "../../..");

/**
 * The registration hosts a chord can be wired into.
 *
 * ⚠️ There are FOUR, not the two this guard was first written with — and the guard itself
 * is what found that out. `⌘⇧P` (command palette) is registered in EditorPanel.tsx, not
 * RightPanelHost.tsx, so the first run failed with "isPaletteChord is never CALLED in a
 * registration host". The registry was right; the host list was wrong. That is the guard
 * behaving exactly as intended: it refused an unproven reachability claim rather than
 * quietly passing.
 *
 * Derived from `grep -rln 'addEventListener("keydown"' src/`, minus `probe/` (dev-only
 * harness, not shippable UI) and minus `dashboard/ViewportContext.tsx` +
 * `picker/PickerOverlay.tsx`, which own view-local keys (timeline viewport gestures, picker
 * navigation) that are not app chords and are deliberately out of this registry's scope.
 */
const HOSTS = [
  "App.tsx",
  "components/workspace/RightPanelHost.tsx",
  "components/workspace/editor/EditorPanel.tsx",
  "components/workspace/Workspace.tsx",
] as const;

/**
 * Strip line and block comments so an assertion cannot be satisfied by prose.
 *
 * ⚠️ Order matters: block comments first, then line comments. Doing it the other way
 * mangles a line comment nested inside a block comment and can leave a dangling terminator.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function readHostSources(): string {
  return HOSTS.map((h) =>
    stripComments(readFileSync(resolve(SRC, h), "utf8")),
  ).join("\n");
}

describe("chord registry — shape", () => {
  it("every entry has a stable id, a label, and at least one outcome", () => {
    for (const entry of CHORD_REGISTRY) {
      expect(entry.id, "id must be non-empty").toBeTruthy();
      expect(entry.label, `${entry.id}: label must be non-empty`).toBeTruthy();
      expect(
        entry.outcomes.length,
        `${entry.id}: must have at least one outcome`,
      ).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = CHORD_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ⚠️ Uniqueness is on (label, host), NOT on label alone. The first version of this test
  // asserted bare-label uniqueness and had to be corrected when the terminal-zoom omission was
  // fixed: `⌘= / ⌘- / ⌘0` legitimately appears TWICE — once Claudesk-owned (Workspace.tsx
  // zooms the focused terminal) and once CM6-owned (the editor's own keymap). Same keys, two
  // owners, disambiguated by focus. Collapsing them would re-introduce the very omission
  // verify-self caught. A repeated label within ONE host is still a data bug.
  it("(label, host) pairs are unique — a repeat within one host is a data bug", () => {
    const pairs = CHORD_REGISTRY.map((e) => `${e.host}::${e.label}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("a label shared across hosts is Claudesk-owned in at most one of them", () => {
    // The shared-label case is only coherent if exactly one owner claims it; two
    // claudeskOwned rows with the same label would mean Claudesk fights itself for the key.
    const byLabel = new Map<string, number>();
    for (const e of CHORD_REGISTRY.filter((x) => x.claudeskOwned)) {
      byLabel.set(e.label, (byLabel.get(e.label) ?? 0) + 1);
    }
    const contested = [...byLabel].filter(([, n]) => n > 1).map(([l]) => l);
    expect(
      contested,
      "two Claudesk-owned entries claim the same label",
    ).toEqual([]);
  });

  // ⌘W is the canary for the context-scoped model. If someone "simplifies" the outcome
  // array to a single string, this fails — which is the point: RightPanelHost routes the
  // SAME isCloseTabChord through shouldCloseTerminalOnChord by focus context, so ⌘W is one
  // chord with two outcomes. Flattening it would make the Settings list state a falsehood.
  it("⌘W is modelled as ONE chord with TWO context-scoped outcomes", () => {
    const closeW = CHORD_REGISTRY.find((e) => e.id === "close-w");
    expect(closeW).toBeDefined();
    expect(closeW!.outcomes.length).toBe(2);
    for (const outcome of closeW!.outcomes) {
      expect(
        outcome.whenFocused,
        "a context-scoped outcome must say which context it applies in",
      ).toBeTruthy();
    }
  });

  // The font-zoom label is deliberately carried by TWO rows — Claudesk's (Workspace.tsx zooms
  // the focused terminal) and CM6's (the editor's own keymap) — selected at runtime by live DOM
  // focus. verify-self adjudicated the split technically correct: Workspace.tsx calls
  // preventDefault only on the left-half and right-panel-terminal branches, so with the editor
  // focused the chord is NOT swallowed and reaches CM6. verify-human then ruled (2026-09-17,
  // P1.verify-human.3) that it also ships to users AS TWO ORDINARY ROWS — no merged row, no
  // special presentation.
  //
  // Both uniqueness arms above PERMIT this split but neither REQUIRES it, so without this test
  // nothing fails if a future author "tidies" the two rows into one merged entry — which is
  // precisely the tidy-up a Phase 2 renderer invites. Collapsing them would make the surface
  // lie: it would tell a user those keys belong to CodeMirror when in a focused terminal they
  // are Claudesk's own path.
  it("the font-zoom label is carried by TWO rows, one per owner — not merged", () => {
    const FONT_ZOOM_LABEL = "⌘= / ⌘- / ⌘0";
    const zoomRows = CHORD_REGISTRY.filter((e) => e.label === FONT_ZOOM_LABEL);

    expect(
      zoomRows.map((e) => e.id).sort(),
      "font zoom must remain two separate rows (Claudesk-owned + CM6-owned); merging them " +
        "would tell users the keys belong to CodeMirror even when a terminal has focus",
    ).toEqual(["cm6-font-zoom", "terminal-font-zoom"]);

    const byHost = new Map(zoomRows.map((e) => [e.host, e]));
    expect(byHost.get("workspace")?.claudeskOwned).toBe(true);
    expect(byHost.get("editor")?.claudeskOwned).toBe(false);
  });
});

describe("chord registry — reachability (the load-bearing guard)", () => {
  it("every Claudesk-owned matcher module exists on disk", () => {
    for (const entry of CHORD_REGISTRY) {
      if (!entry.claudeskOwned || entry.matcher === null) continue;
      const path = resolve(SRC, entry.matcher);
      expect(
        existsSync(path),
        `${entry.id}: matcher not found at ${entry.matcher}`,
      ).toBe(true);
    }
  });

  it("every Claudesk-owned matcher is IMPORTED by a registration host", () => {
    const hosts = readHostSources();
    for (const entry of CHORD_REGISTRY) {
      if (!entry.claudeskOwned || entry.matcher === null) continue;
      // The module basename without extension, e.g. "finderChord".
      const moduleName = entry.matcher
        .split("/")
        .pop()!
        .replace(/\.tsx?$/, "");
      expect(
        hosts.includes(moduleName),
        `${entry.id}: no registration host imports ${moduleName} — the entry would render ` +
          `in Settings while being wired to nothing`,
      ).toBe(true);
    }
  });

  // ⚠️ The strongest of the three, and the one that survives the comment-block trap. An
  // import with no call site still satisfies the assertion above; this one requires the
  // symbol to appear in CALL position in comment-stripped host source.
  it("every Claudesk-owned matcher is CALLED by a registration host, not merely imported", () => {
    const hosts = readHostSources();

    // Exported call symbols per matcher module. Signatures VARY deliberately — boolean,
    // number|null, RightPanel|null, and panelForChord takes a second argument — which is
    // why the registry stores a module path rather than pretending to a common function
    // type. The call-shape assertion works regardless of return type.
    const CALL_SYMBOLS: Record<string, string> = {
      workspaceSwitchChord: "workspaceSwitchIndex",
      newWorkspaceChord: "newWorkspaceChord",
      dashboardChord: "isDashboardChord",
      settingsChord: "isSettingsChord",
      finderChord: "isFinderChord",
      searchChord: "isSearchChord",
      newFileChord: "isNewFileChord",
      panelHost: "panelForChord",
      tabSwitchChord: "tabSwitchIndex",
      closeTabChord: "isCloseTabChord",
      newTerminalChord: "newTerminalChord",
      terminalFontZoom: "terminalZoomForChord",
      paletteCommands: "isPaletteChord",
    };

    for (const entry of CHORD_REGISTRY) {
      if (!entry.claudeskOwned || entry.matcher === null) continue;
      const moduleName = entry.matcher
        .split("/")
        .pop()!
        .replace(/\.tsx?$/, "");
      const symbol = CALL_SYMBOLS[moduleName];
      expect(
        symbol,
        `${entry.id}: no call symbol mapped for ${moduleName}`,
      ).toBeTruthy();
      expect(
        hosts.includes(`${symbol}(`),
        `${entry.id}: ${symbol} is never CALLED in a registration host (imported-but-dead)`,
      ).toBe(true);
    }
  });
});

describe("chord registry — COMPLETENESS (the other direction)", () => {
  // ⚠️ WHY THIS BLOCK EXISTS, and why the reachability block above is not enough.
  //
  // Reachability walks registry → code: for each ENTRY, is it real? That direction cannot
  // see a chord the app registers but the registry omits, because an entry-less chord is not
  // an entry and nothing iterates it. verify-self found exactly two such omissions on the
  // first pass — terminal font zoom (Workspace.tsx) and ⌘\ toggle-wrap (CM6) — one of which
  // documented its own check against the OLD comment map and was then never added to it.
  //
  // ⚠️ Adding a host to HOSTS does NOT fix this: Workspace.tsx was ALREADY in that list when
  // the terminal-zoom omission shipped. An unused host passes silently. The guard has to walk
  // the OTHER way — from what the hosts actually CALL, back to the registry.
  //
  // ⚠️ It also cannot key on filenames. `terminalFontZoom.ts` — the module that was missed —
  // does not match `*Chord*`, and neither do `panelHost.ts` or `paletteCommands.ts`. A
  // filename scan would have reported "complete" on the broken tree.

  /** Call sites of the form `someName(` in comment-stripped host source. */
  function calledSymbols(source: string): Set<string> {
    const out = new Set<string>();
    for (const m of source.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g))
      out.add(m[1]);
    return out;
  }

  // Chord-matcher symbols the registry accounts for, mapped to the entry ids that claim them.
  const ACCOUNTED: Record<string, string> = {
    workspaceSwitchIndex: "workspace-switch",
    newWorkspaceChord: "new-workspace",
    isDashboardChord: "dashboard",
    isSettingsChord: "settings",
    isPaletteChord: "command-palette",
    isFinderChord: "file-finder",
    isSearchChord: "project-search",
    isNewFileChord: "new-file",
    panelForChord: "panel-select-editor",
    tabSwitchIndex: "tab-switch",
    isCloseTabChord: "close-w",
    newTerminalChord: "new-terminal",
    terminalZoomForChord: "terminal-font-zoom",
    // Not a matcher: a ROUTER that consumes isCloseTabChord's result and decides, by focus,
    // whether ⌘W closes a terminal or an editor tab. It owns no chord of its own — which is
    // precisely why `close-w` is ONE entry with two outcomes rather than two entries.
    shouldCloseTerminalOnChord: "close-w",
  };

  it("every chord-matcher symbol a host CALLS is accounted for by a registry entry", () => {
    const called = calledSymbols(readHostSources());

    // Chord-shaped call sites: the naming conventions this codebase actually uses for a
    // chord matcher. Deliberately broader than `*Chord` — `terminalZoomForChord` matches
    // here, but so must `panelForChord` / `tabSwitchIndex` / `workspaceSwitchIndex`, which a
    // narrower pattern would miss.
    const chordish = [...called].filter(
      (n) => /[Cc]hord/.test(n) || /^(tabSwitch|workspaceSwitch)Index$/.test(n),
    );

    const ids = new Set(CHORD_REGISTRY.map((e) => e.id));
    const unaccounted = chordish.filter(
      (n) => !(n in ACCOUNTED) || !ids.has(ACCOUNTED[n]),
    );

    expect(
      unaccounted,
      `these chord matchers are CALLED by a registration host but no registry entry claims ` +
        `them — Settings would omit a chord the app really has (the exact drift this WP ` +
        `exists to kill)`,
    ).toEqual([]);
  });

  it("the accounted-for map has no stale rows — every id it names still exists", () => {
    // Keeps the map above honest in the other direction: renaming or deleting an entry must
    // not leave ACCOUNTED silently pointing at nothing, which would let a real omission hide
    // behind a dangling row.
    const ids = new Set(CHORD_REGISTRY.map((e) => e.id));
    const stale = Object.entries(ACCOUNTED).filter(([, id]) => !ids.has(id));
    expect(stale, "ACCOUNTED names registry ids that no longer exist").toEqual(
      [],
    );
  });

  it("the CM6-owned set matches editorExtensions.ts coreKeymap", () => {
    // The CM6 entries are `matcher: null`, so the call-shape guard above cannot reach them —
    // they are bound declaratively inside CodeMirror's keymap, not called by a host. ⌘\
    // toggle-wrap was omitted for exactly this reason: nothing pointed at it. Assert against
    // the keymap source instead.
    const src = stripComments(
      readFileSync(
        resolve(SRC, "components/workspace/editor/editorExtensions.ts"),
        "utf8",
      ),
    );
    const bound = new Set(
      [...src.matchAll(/key:\s*"(Mod-[^"]+)"/g)].map((m) => m[1]),
    );

    // Mod-bindings the registry deliberately does NOT list as their own row, with the reason.
    const NOT_LISTED = new Set([
      "Mod-+", // same row as Mod-= (shift variant of the same key)
      "Mod--", // same row as Mod-= (the "⌘= / ⌘- / ⌘0" label covers it)
      "Mod-0", // same row as Mod-=
    ]);

    const cm6Labels = CHORD_REGISTRY.filter((e) => e.host === "editor").map(
      (e) => e.label,
    );
    for (const key of bound) {
      if (NOT_LISTED.has(key)) continue;
      // ⚠️ The source text is `"Mod-\\"`, so the regex capture yields a DOUBLE backslash.
      // Unescape it or the expectation is built against a string the label can never equal —
      // a guard that fails for the wrong reason is as useless as one that passes for the
      // wrong reason.
      const letter = key.slice(4).replace(/\\\\/g, "\\"); // "Mod-s" -> "s"
      const expected = letter === "=" ? "⌘=" : `⌘${letter.toUpperCase()}`;
      expect(
        cm6Labels.some((l) => l.includes(expected)),
        `coreKeymap binds ${key} but no host: "editor" registry entry mentions ${expected}`,
      ).toBe(true);
    }
  });
});

describe("visibleChords — the single accessor", () => {
  it("omits the gate-dependent chord when the gate is OFF", () => {
    const off = visibleChords(false);
    expect(off.some((e) => e.requiresWorkflowGate)).toBe(false);
    // ⚠️ Omitted, not greyed: with the gate off the app must be byte-identical to one that
    // never had the feature — a visible-but-inert row is the dead affordance the M10.9 prior
    // forbids.
    expect(off.some((e) => e.id === "panel-select-docs")).toBe(false);
  });

  it("includes the gate-dependent chord when the gate is ON", () => {
    const on = visibleChords(true);
    expect(on.some((e) => e.id === "panel-select-docs")).toBe(true);
    expect(on.length).toBe(CHORD_REGISTRY.length);
  });

  it("the gate actually changes the result — off is a strict subset of on", () => {
    const off = visibleChords(false);
    const on = visibleChords(true);
    expect(off.length).toBeLessThan(on.length);
  });
});

describe("chordLabel", () => {
  it("returns the label for a known id", () => {
    expect(chordLabel("project-search")).toBe("⌘⇧F");
    expect(chordLabel("file-finder")).toBe("⌘P");
  });

  it("throws on an unknown id rather than returning a blank label", () => {
    expect(() => chordLabel("nope")).toThrow(/unknown chord id/);
  });
});
