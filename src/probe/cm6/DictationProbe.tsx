// F-a WP1 probe — does macOS dictation compose cleanly into a CM6 prose view,
// and what does LINE WRAPPING require in order to work with it?
// THROWAWAY probe code (mounted via ?cm6probe&mode=dictation).
//
// ⚠️ WRAP IS A REQUIREMENT, NOT AN OUTCOME (operator, 2026-09-21). This probe finds
// *how* to make wrap work, not *whether* to wrap. Only an outright infeasibility
// finding reopens that default.
//
// Why a probe at all: macOS dictation is PHYSICAL operator input — not
// agent-triggerable, not agent-observable — and `grep` confirms zero IME/composition
// handling exists anywhere in the codebase, so there is no prior art to reason from.
//
// THREE arms, and each one earns its place:
//   • CM6 wrap-ON   — the shipping candidate (wrap is a REQUIREMENT, not a toggle).
//   • CM6 wrap-OFF  — an INSTRUMENT, never a shipping option. It exists so a wrap-ON
//     misbehavior is ATTRIBUTABLE: without it, "dictation is broken in CM6" and
//     "wrapping breaks dictation" are indistinguishable.
//   • plain textarea — the CONTROL, a different input mechanism entirely, so a CM6
//     failure can be told apart from dictation being unreliable in a WKWebView at all.
// ⚠️ All three die with the probe at P3.4. None is a product option.
//
// ⚠️ The transcript is rendered ON SCREEN rather than logged: this runs in the
// WKWebView, where `read_logs{source:"console"}` captures nothing for this app, so an
// on-screen readout is the only channel that reaches the operator.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { oneDarkTheme } from "./theme";

/** One recorded event from an arm. */
interface ProbeEvent {
  /** ms since the arm mounted — relative, so two arms are comparable. */
  t: number;
  kind:
    | "compositionstart"
    | "compositionupdate"
    | "compositionend"
    | "docChanged";
  /** Doc length AFTER the event. */
  docLen: number;
  /** Change in doc length attributable to this event (docChanged only). */
  delta?: number;
  /** Head of the primary selection after the event — the insert position. */
  head?: number;
  /** For composition events: the IME data string, truncated. */
  data?: string;
}

type ArmId = "cm6-wrap-on" | "cm6-wrap-off" | "textarea-control";

const ARM_LABEL: Record<ArmId, string> = {
  "cm6-wrap-on": "CM6 — wrap ON (the shipping candidate)",
  "cm6-wrap-off": "CM6 — wrap OFF (comparison arm)",
  "textarea-control": "Plain <textarea> — CONTROL (known-good baseline)",
};

/** Truncate IME data so one long utterance does not flood the readout. */
function clip(s: string | null): string | undefined {
  if (s === null || s === "") return undefined;
  return s.length > 40 ? `${s.slice(0, 40)}…(${s.length})` : s;
}

/**
 * One CM6 arm. `wrap` is the ONLY difference between the two instances — keep it
 * that way, or a divergence stops being attributable to wrapping.
 */
function Cm6Arm({
  arm,
  wrap,
  onEvent,
  onText,
}: {
  arm: ArmId;
  wrap: boolean;
  onEvent: (arm: ArmId, e: ProbeEvent) => void;
  onText: (arm: ArmId, text: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const t0 = performance.now();
    const at = () => Math.round(performance.now() - t0);
    let lastLen = 0;

    // Composition events are DOM-level: CM6 does not surface them through its own
    // update cycle, so they are captured on the contentDOM directly. This is the
    // whole point of the probe — `updateListener` alone cannot tell a composed
    // insert from a typed one.
    const onComp = (kind: ProbeEvent["kind"]) => (ev: Event) => {
      const view = viewRef.current;
      onEvent(arm, {
        t: at(),
        kind,
        docLen: view === null ? 0 : view.state.doc.length,
        head: view === null ? undefined : view.state.selection.main.head,
        data: clip((ev as CompositionEvent).data ?? null),
      });
    };

    const handlers: [string, EventListener][] = [
      ["compositionstart", onComp("compositionstart")],
      ["compositionupdate", onComp("compositionupdate")],
      ["compositionend", onComp("compositionend")],
    ];

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          // A PROSE surface: no line numbers, no language mode, no bracket
          // matching — matching WP3's intent rather than the file editor's.
          ...(wrap ? [EditorView.lineWrapping] : []),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          oneDarkTheme,
          EditorView.theme({
            "&": { height: "260px" },
            ".cm-content": {
              fontFamily: "ui-sans-serif, -apple-system, system-ui, sans-serif",
              fontSize: "14px",
              lineHeight: "1.5",
            },
            ".cm-scroller": { overflow: "auto" },
          }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const len = u.state.doc.length;
            onEvent(arm, {
              t: at(),
              kind: "docChanged",
              docLen: len,
              delta: len - lastLen,
              head: u.state.selection.main.head,
            });
            lastLen = len;
            onText(arm, u.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;

    for (const [name, fn] of handlers) {
      view.contentDOM.addEventListener(name, fn);
    }

    return () => {
      for (const [name, fn] of handlers) {
        view.contentDOM.removeEventListener(name, fn);
      }
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once per arm: `wrap` and `arm` are fixed per instance by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <h4 style={{ margin: "0 0 6px", font: "600 13px system-ui" }}>
        {ARM_LABEL[arm]}
      </h4>
      <div
        ref={hostRef}
        data-probe-arm={arm}
        style={{ border: "1px solid #333", borderRadius: 4 }}
      />
    </div>
  );
}

/**
 * The CONTROL arm — a plain `<textarea>`, instrumented IDENTICALLY to the CM6 arms.
 *
 * ⚠️ Its job is to make a CM6 failure ATTRIBUTABLE. Without it, "dictation garbled the
 * text" cannot distinguish a CM6/contenteditable problem from dictation being
 * unreliable in a WKWebView at all — and the operator has already seen dictation
 * misbehave in the CC pane, so "it is bad everywhere in this app" is a live
 * hypothesis, not a straw one.
 *
 * ⚠️ It is a CONTROL, never a shipping candidate. A `<textarea>` cannot carry the
 * staging area's requirements (undo/redo history, search-within-draft, decorations),
 * which is why the surface is CM6 in the first place.
 *
 * The instrumentation must stay the SAME SHAPE as `Cm6Arm`'s or the transcripts are
 * not comparable — same event kinds, same fields, same clock origin.
 */
function TextareaArm({
  onEvent,
  onText,
}: {
  onEvent: (arm: ArmId, e: ProbeEvent) => void;
  onText: (arm: ArmId, text: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const t0Ref = useRef<number>(0);
  const lastLenRef = useRef<number>(0);

  useEffect(() => {
    t0Ref.current = performance.now();
  }, []);

  // ⚠️ The clock read and the ref reads live INSIDE the handlers, never in the render
  // body. React 19's compiler rules reject `performance.now()` (impure) and
  // `ref.current` during render — and they are right to: a render-time reading would
  // be a different value from the one the event actually occurred at.
  const comp = useCallback(
    (kind: ProbeEvent["kind"]) => (e: React.CompositionEvent) => {
      const el = ref.current;
      onEvent("textarea-control", {
        t: Math.round(performance.now() - t0Ref.current),
        kind,
        docLen: el === null ? 0 : el.value.length,
        head: el === null ? undefined : (el.selectionStart ?? undefined),
        data: clip(e.data ?? null),
      });
    },
    [onEvent],
  );

  const onCompStart = useMemo(() => comp("compositionstart"), [comp]);
  const onCompUpdate = useMemo(() => comp("compositionupdate"), [comp]);
  const onCompEnd = useMemo(() => comp("compositionend"), [comp]);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const len = e.target.value.length;
      onEvent("textarea-control", {
        t: Math.round(performance.now() - t0Ref.current),
        kind: "docChanged",
        docLen: len,
        delta: len - lastLenRef.current,
        head: e.target.selectionStart ?? undefined,
      });
      lastLenRef.current = len;
      onText("textarea-control", e.target.value);
    },
    [onEvent, onText],
  );

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <h4 style={{ margin: "0 0 6px", font: "600 13px system-ui" }}>
        {ARM_LABEL["textarea-control"]}
      </h4>
      <textarea
        ref={ref}
        data-probe-arm="textarea-control"
        onCompositionStart={onCompStart}
        onCompositionUpdate={onCompUpdate}
        onCompositionEnd={onCompEnd}
        onChange={onChange}
        style={{
          width: "100%",
          height: "260px",
          boxSizing: "border-box",
          background: "#1a1a1a",
          color: "#ddd",
          border: "1px solid #333",
          borderRadius: 4,
          padding: "4px 6px",
          font: "14px/1.5 ui-sans-serif, -apple-system, system-ui, sans-serif",
          resize: "none",
        }}
      />
    </div>
  );
}

/** Per-arm collected state. */
interface ArmState {
  events: ProbeEvent[];
  text: string;
}

const EMPTY_ARM: ArmState = { events: [], text: "" };

/** Every arm, in the order they render and export. */
const ALL_ARMS: ArmId[] = ["cm6-wrap-on", "cm6-wrap-off", "textarea-control"];

/** One row of a transcript, formatted for both the on-screen `<pre>` and the export. */
function formatRow(e: ProbeEvent): string {
  return (
    `${String(e.t).padStart(6)}ms  ${e.kind.padEnd(18)}` +
    `len=${String(e.docLen).padEnd(6)}` +
    (e.delta === undefined ? "" : `Δ=${e.delta > 0 ? "+" : ""}${e.delta} `) +
    (e.head === undefined ? "" : `head=${e.head} `) +
    (e.data === undefined ? "" : `data=${JSON.stringify(e.data)}`)
  );
}

/**
 * Build the self-describing report the operator pastes back.
 *
 * ⚠️ It carries the ARM LABELS and the FINAL TEXT of each arm, not just the event
 * rows — a transcript of deltas cannot answer "did the utterance survive intact?",
 * which is success criterion (c). It is also why the operator does not have to
 * annotate anything: the paste explains itself.
 */
function buildReport(arms: Record<ArmId, ArmState>): string {
  const lines: string[] = [
    "F-a WP1 — macOS dictation into CM6: probe transcript",
    `captured: ${new Date().toISOString()}`,
    `ua: ${typeof navigator === "undefined" ? "(n/a)" : navigator.userAgent}`,
    "",
  ];
  for (const arm of ALL_ARMS) {
    const { events, text } = arms[arm];
    lines.push(`=== ${ARM_LABEL[arm]} ===`);
    lines.push(`events: ${events.length}   final length: ${text.length}`);
    lines.push("--- events ---");
    lines.push(
      events.length === 0 ? "(none)" : events.map(formatRow).join("\n"),
    );
    lines.push("--- final text ---");
    lines.push(text.length === 0 ? "(empty)" : text);
    lines.push("");
  }
  return lines.join("\n");
}

export default function DictationProbe() {
  const [arms, setArms] = useState<Record<ArmId, ArmState>>({
    "cm6-wrap-on": EMPTY_ARM,
    "cm6-wrap-off": EMPTY_ARM,
    "textarea-control": EMPTY_ARM,
  });
  const [copied, setCopied] = useState<string | null>(null);

  const pushEvent = (arm: ArmId, e: ProbeEvent) =>
    setArms((prev) => ({
      ...prev,
      [arm]: { ...prev[arm], events: [...prev[arm].events, e] },
    }));

  const setText = (arm: ArmId, text: string) =>
    setArms((prev) => ({ ...prev, [arm]: { ...prev[arm], text } }));

  const reset = () => {
    setArms({
      "cm6-wrap-on": EMPTY_ARM,
      "cm6-wrap-off": EMPTY_ARM,
      "textarea-control": EMPTY_ARM,
    });
    setCopied(null);
  };

  const report = buildReport(arms);

  // Clipboard can reject (permissions, insecure context). The report is ALSO rendered
  // on screen below, so a failed copy degrades to "select and copy manually" rather
  // than losing the run — which matters because re-dictating is the expensive thing.
  const copyReport = () => {
    navigator.clipboard?.writeText(report).then(
      () => setCopied("copied to clipboard"),
      () => setCopied("clipboard blocked — copy from the box below"),
    );
  };

  const armIds: ArmId[] = ALL_ARMS;

  return (
    <div style={{ padding: "0 12px 24px" }}>
      <ol
        data-probe-instructions
        style={{
          font: "13px/1.6 system-ui",
          color: "#bbb",
          maxWidth: 900,
          paddingLeft: 20,
        }}
      >
        <li>
          Dictate a <strong>long passage</strong> into <strong>each</strong> of
          the three boxes — several sentences, <strong>in one take</strong>, the
          way you would actually dictate a prompt. ⚠️ A short phrase measures
          the harness, not the system.
        </li>
        <li>
          Use the <strong>same passage</strong> in all three, so the arms are
          comparable.
        </li>
        <li>
          Click <strong>Copy transcript</strong> and paste the result back. It
          is self-describing — no annotation needed.
        </li>
      </ol>

      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {armIds.map((arm) =>
          arm === "textarea-control" ? (
            <TextareaArm key={arm} onEvent={pushEvent} onText={setText} />
          ) : (
            <Cm6Arm
              key={arm}
              arm={arm}
              wrap={arm === "cm6-wrap-on"}
              onEvent={pushEvent}
              onText={setText}
            />
          ),
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          data-probe-copy
          onClick={copyReport}
          style={{ font: "600 13px system-ui", padding: "5px 12px" }}
        >
          Copy transcript
        </button>
        <button
          type="button"
          onClick={reset}
          style={{ font: "13px system-ui", padding: "5px 12px" }}
        >
          Reset
        </button>
        {copied !== null && (
          <span style={{ font: "12px system-ui", color: "#9c9" }} role="status">
            {copied}
          </span>
        )}
      </div>

      {armIds.map((arm) => (
        <section key={arm} style={{ marginBottom: 20 }}>
          <h4 style={{ margin: "0 0 4px", font: "600 13px system-ui" }}>
            {ARM_LABEL[arm]} — {arms[arm].events.length} events,{" "}
            {arms[arm].text.length} chars
          </h4>
          <pre
            data-probe-transcript={arm}
            style={{
              background: "#161616",
              border: "1px solid #333",
              borderRadius: 4,
              padding: 8,
              maxHeight: 200,
              overflow: "auto",
              font: "12px/1.4 ui-monospace, monospace",
              color: "#ccc",
              whiteSpace: "pre-wrap",
            }}
          >
            {/* Same `formatRow` the export uses — one formatter, so what the
                operator reads on screen is byte-identical to what they paste. */}
            {arms[arm].events.length === 0
              ? "(no events yet — dictate or type into this arm)"
              : arms[arm].events.map(formatRow).join("\n")}
          </pre>
        </section>
      ))}

      <section>
        <h4 style={{ margin: "0 0 4px", font: "600 13px system-ui" }}>
          Full report (what “Copy transcript” puts on the clipboard)
        </h4>
        <pre
          data-probe-report
          style={{
            background: "#111",
            border: "1px solid #2a4",
            borderRadius: 4,
            padding: 8,
            maxHeight: 260,
            overflow: "auto",
            font: "12px/1.4 ui-monospace, monospace",
            color: "#cdc",
            whiteSpace: "pre-wrap",
          }}
        >
          {report}
        </pre>
      </section>
    </div>
  );
}
