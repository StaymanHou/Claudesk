// WP1 probe — objective (b): CPU/RAM cost of N mounted CM6 instances.
// THROWAWAY probe code (mounted via ?cm6probe&mode=nmount).
//
// Reproduces M2's worst case: N workspaces each holding a CM6 editor, plus a
// couple of @codemirror/merge MergeViews (diff panels), all mounted at once with
// backgrounded ones display:none (mirrors the "all workspaces stay mounted" rule).
//
// Measurement mirrors WP4 EXACTLY so numbers are comparable:
//   - idle: all editors mounted, no typing → measure CPU/RAM
//   - active: simulate typing into the foreground editor → measure CPU/RAM
//   CPU via `top -l` on WebContent+GPU PIDs (run externally), RAM via footprint.
// Envelope (from WP4): idle CPU < 10% (WP4 measured 4.5%), RAM < 300MB
// (WP4: 147MB idle / 240MB active).
//
// Default N = 8 editors + 2 MergeViews, matching the WBS §WP1 "≈8 + 2 MergeViews".

import { useEffect, useRef, useState } from "react";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { oneDarkTheme } from "./theme";
import { MergeView } from "@codemirror/merge";

const params = new URLSearchParams(window.location.search);
const N_EDITORS = Number(params.get("n") ?? "8");
const N_MERGE = Number(params.get("merge") ?? "2");
// How many editors are visible (foreground) vs display:none (background).
const N_VISIBLE = Number(params.get("visible") ?? "1");

// A representative source file body — moderately sized so each editor has real
// content to lay out (not a trivial one-liner that under-measures cost).
function genSource(seed: number): string {
  const lines: string[] = [];
  lines.push(
    `// editor #${seed} — synthetic source for the N-mount perf probe`,
  );
  for (let i = 0; i < 200; i++) {
    lines.push(
      `function fn_${seed}_${i}(x: number): number { const y = x * ${i} + ${seed}; return y > 0 ? y : -y; }`,
    );
  }
  return lines.join("\n");
}

function makeEditorState(seed: number, onActiveType?: () => void) {
  return EditorState.create({
    doc: genSource(seed),
    extensions: [
      lineNumbers(),
      javascript(),
      oneDarkTheme,
      keymap.of(defaultKeymap),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && onActiveType) onActiveType();
      }),
    ],
  });
}

export default function NMountProbe() {
  const editorHosts = useRef<(HTMLDivElement | null)[]>([]);
  const mergeHosts = useRef<(HTMLDivElement | null)[]>([]);
  const editorViews = useRef<EditorView[]>([]);
  const mergeViews = useRef<MergeView[]>([]);
  const [typing, setTyping] = useState(false);

  // Mount all editors + merge views once.
  useEffect(() => {
    const views: EditorView[] = [];
    for (let i = 0; i < N_EDITORS; i++) {
      const host = editorHosts.current[i];
      if (!host) continue;
      const view = new EditorView({
        state: makeEditorState(i),
        parent: host,
      });
      views.push(view);
    }
    editorViews.current = views;

    const merges: MergeView[] = [];
    for (let i = 0; i < N_MERGE; i++) {
      const host = mergeHosts.current[i];
      if (!host) continue;
      const a = genSource(1000 + i);
      const b = a.replace(/return y/g, "return /*changed*/ y"); // diff vs base
      const mv = new MergeView({
        a: { doc: a, extensions: [javascript(), oneDarkTheme, lineNumbers()] },
        b: {
          doc: b,
          extensions: [javascript(), oneDarkTheme, lineNumbers()],
        },
        parent: host,
      });
      merges.push(mv);
    }
    mergeViews.current = merges;

    return () => {
      views.forEach((v) => v.destroy());
      merges.forEach((m) => m.destroy());
    };
  }, []);

  // "Active typing" simulation: dispatch an insert into the foreground editor on
  // an interval, mimicking a user typing — drives the active-CPU measurement.
  useEffect(() => {
    if (!typing) return;
    const fg = editorViews.current[0];
    if (!fg) return;
    let n = 0;
    const id = window.setInterval(() => {
      const pos = fg.state.doc.length;
      const ch = "abcdefghij"[n % 10];
      fg.dispatch({ changes: { from: pos, insert: ch } });
      n++;
    }, 40); // ~25 chars/s, faster than human but a deterministic stress
    return () => window.clearInterval(id);
  }, [typing]);

  return (
    <div style={{ padding: 12, color: "#eee" }}>
      <div style={{ marginBottom: 8, font: "12px ui-monospace, monospace" }}>
        N-mount probe · {N_EDITORS} editors + {N_MERGE} MergeViews · {N_VISIBLE}{" "}
        visible, {N_EDITORS - N_VISIBLE} display:none{" "}
        <button onClick={() => setTyping((t) => !t)} style={{ marginLeft: 8 }}>
          {typing ? "stop typing (active→idle)" : "start typing (idle→active)"}
        </button>
      </div>

      {/* Visible (foreground) editors */}
      {Array.from({ length: N_EDITORS }).map((_, i) => (
        <div
          key={`ed-${i}`}
          ref={(el) => {
            editorHosts.current[i] = el;
          }}
          style={{
            display: i < N_VISIBLE ? "block" : "none",
            height: i < N_VISIBLE ? "40vh" : 0,
            border: "1px solid #333",
            marginBottom: 8,
            overflow: "auto",
          }}
        />
      ))}

      {/* MergeViews — first visible, rest display:none */}
      {Array.from({ length: N_MERGE }).map((_, i) => (
        <div
          key={`mv-${i}`}
          ref={(el) => {
            mergeHosts.current[i] = el;
          }}
          style={{
            display: i < 1 ? "block" : "none",
            height: i < 1 ? "30vh" : 0,
            border: "1px solid #533",
            marginBottom: 8,
            overflow: "auto",
          }}
        />
      ))}
    </div>
  );
}
