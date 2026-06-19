/* eslint-disable react-hooks/refs -- THROWAWAY probe: the CM6 keymap closures call
   `record` (a stable useCallback) whose ref reads happen at event time, not render;
   the rule's static heuristic can't see that and false-positives on keymap.of(). */
// WP1 probe — objective (a): can app-level chords fire while focus is inside a
// mounted CodeMirror 6 editor? THROWAWAY probe code (mounted via ?cm6probe&mode=hotkey).
//
// The unknown (research.md Risk "Cmd+P / Cmd+Shift+P palette hotkeys vs CM6 focus"):
// CM6 installs its keymap on the editor's contentEditable. A naive document-level
// listener may never see a chord while the editor is focused, and CM6 may
// preventDefault keys it owns. We need the registration pattern that makes the
// right-half panel-switch hotkey (Cmd+J here) and Cmd+P fire *while the cursor is
// in the editor*.
//
// This harness wires up THREE candidate registration strategies at once and logs,
// per chord, which strategies fired. The operator presses the chords with focus in
// the editor and reads the log — the winning pattern is whichever fires reliably
// without CM6 swallowing it.
//
//   Strategy 1 — CM6 keybinding (Prec.highest), run handler, return TRUE (consume).
//                Tests: does a CM6-native binding reliably beat the default keymap,
//                and can the app act from inside it?
//   Strategy 2 — CM6 keybinding (Prec.highest), run handler, return FALSE (let it
//                bubble too). Tests: does returning false re-dispatch to the DOM?
//   Strategy 3 — document-level CAPTURE-phase listener. Tests: does capture phase
//                see the chord before CM6's contentEditable handler?
//   (Strategy 4 — document-level BUBBLE listener — added implicitly: if it ever
//                logs, CM6 did NOT stop propagation. We register it to observe.)

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { keymap, EditorView } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";

type Source = "cm6-consume" | "cm6-bubble" | "doc-capture" | "doc-bubble";

interface LogLine {
  chord: string;
  sources: Source[];
}

const SAMPLE = `// Press the chords below WITH THE CURSOR IN THIS EDITOR.
// Watch the log on the right: each row shows which strategies fired.
//
//   Cmd+J  → panel-switch hotkey (our right-half cycle)
//   Cmd+P  → fuzzy file finder
//   Cmd+Shift+P → command palette
//
// Also type normally + try Cmd+A / Cmd+C / arrows to confirm the editor
// still works (no swallowed editing keys).

function multiCursorMe() {
  const a = 1;
  const b = 2;
  return a + b;
}
`;

function isChord(e: KeyboardEvent): string | null {
  const meta = e.metaKey || e.ctrlKey;
  if (!meta) return null;
  const k = e.key.toLowerCase();
  if (k === "j") return "Cmd+J (panel-switch)";
  if (k === "p" && e.shiftKey) return "Cmd+Shift+P (command palette)";
  if (k === "p") return "Cmd+P (fuzzy finder)";
  return null;
}

export default function HotkeyProbe() {
  // Aggregate fires for the same chord within a short window into one log row,
  // so the operator sees "Cmd+J → [cm6-consume, doc-capture]" not 4 separate rows.
  const [log, setLog] = useState<LogLine[]>([]);
  const pending = useRef<Map<string, Set<Source>>>(new Map());
  const flushTimer = useRef<number | null>(null);

  const record = useCallback((chord: string, source: Source) => {
    const set = pending.current.get(chord) ?? new Set<Source>();
    set.add(source);
    pending.current.set(chord, set);
    if (flushTimer.current == null) {
      flushTimer.current = window.setTimeout(() => {
        const rows: LogLine[] = [];
        for (const [c, s] of pending.current.entries()) {
          rows.push({ chord: c, sources: [...s] });
        }
        pending.current.clear();
        flushTimer.current = null;
        setLog((prev) => [...rows, ...prev].slice(0, 40));
      }, 60);
    }
  }, []);

  // --- Strategy 3 + 4: document-level capture & bubble listeners ---
  useEffect(() => {
    const capture = (e: KeyboardEvent) => {
      const chord = isChord(e);
      if (chord) record(chord, "doc-capture");
    };
    const bubble = (e: KeyboardEvent) => {
      const chord = isChord(e);
      if (chord) record(chord, "doc-bubble");
    };
    document.addEventListener("keydown", capture, true); // capture phase
    document.addEventListener("keydown", bubble, false); // bubble phase
    return () => {
      document.removeEventListener("keydown", capture, true);
      document.removeEventListener("keydown", bubble, false);
    };
  }, [record]);

  // --- Strategy 1 + 2: CM6 keybindings at highest precedence ---
  // run: the handler that "acts" (here: just log). Returning true consumes; false lets bubble.
  // useMemo so the keymap (and the extensions array identity) is stable across
  // renders — record is a stable useCallback, so this builds exactly once.
  const cm6Keymap = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            // Strategy 1 — Cmd+J: act then CONSUME (preventDefault). This is the
            // candidate for our panel-switch hotkey: CM6 doesn't bind Cmd+J, so a
            // highest-prec binding owns it, and consuming stops the browser default.
            key: "Mod-j",
            run: () => {
              record("Cmd+J (panel-switch)", "cm6-consume");
              return true; // consume
            },
          },
          {
            // Strategy 1 — Cmd+P: CM6 also doesn't bind Cmd+P; act + consume so the
            // browser's print dialog never opens.
            key: "Mod-p",
            run: () => {
              record("Cmd+P (fuzzy finder)", "cm6-consume");
              return true;
            },
          },
          {
            // Strategy 2 — Cmd+Shift+P: act but return FALSE to observe whether the
            // event then continues to the DOM listeners (it should NOT re-dispatch —
            // this confirms returning false ≠ "also bubble to document").
            key: "Mod-Shift-p",
            run: () => {
              record("Cmd+Shift+P (command palette)", "cm6-bubble");
              return false; // do not consume
            },
          },
        ]),
      ),
    [record],
  );

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, height: "82vh" }}>
      <div style={{ flex: "1 1 60%", minWidth: 0 }}>
        <CodeMirror
          value={SAMPLE}
          height="100%"
          theme="dark"
          extensions={[cm6Keymap, javascript(), EditorView.lineWrapping]}
          style={{ height: "100%", fontSize: 13, border: "1px solid #333" }}
          autoFocus
        />
      </div>
      <div
        style={{
          flex: "1 1 40%",
          minWidth: 0,
          font: "12px ui-monospace, monospace",
          color: "#ddd",
          overflow: "auto",
          border: "1px solid #333",
          padding: 8,
        }}
      >
        <div style={{ color: "#9cf", marginBottom: 8 }}>
          chord-fire log (newest first) — strategies that fired per chord:
        </div>
        <button
          onClick={() => setLog([])}
          style={{ marginBottom: 8, fontSize: 11 }}
        >
          clear log
        </button>
        {log.length === 0 && (
          <div style={{ color: "#888" }}>
            (press Cmd+J / Cmd+P / Cmd+Shift+P with the cursor in the editor)
          </div>
        )}
        {log.map((line, i) => (
          <div
            key={i}
            style={{ padding: "2px 0", borderBottom: "1px solid #222" }}
          >
            <span style={{ color: "#fc9" }}>{line.chord}</span>
            {" → "}
            <span style={{ color: "#9f9" }}>[{line.sources.join(", ")}]</span>
          </div>
        ))}
      </div>
    </div>
  );
}
