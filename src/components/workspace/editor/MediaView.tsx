// M16 WP2 — the body of an editor `"file"` tab whose path is media (`mediaKind` non-null).
//
// PaneTabs renders this INSTEAD of EditorPanel, and does not register the path in the shared
// doc store, so no `read_file` ever runs for a media tab. There is no new TabKind: close,
// ⌘W, ⌘1–9, split and tree highlight all keep working on the ordinary file tab.
//
// Flow: `stat_media` (root-confined; also admits the root to the asset scope) → `displayFor`
// picks the view → the asset URL is built from the CANONICAL path the backend returned, never
// from the tab path, and cache-busted with the mtime so a regenerated file is not served stale.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { MediaCard } from "./MediaCard";
import { MediaPlayer } from "./MediaPlayer";
import type { Playhead } from "./mediaClock";
import {
  assetUrlFor,
  readTextFile,
  statMedia,
  type Invoker,
  type MediaStat,
} from "./mediaIpc";
import { extensionOf, type MediaKind } from "./mediaKind";
import {
  formatBytes,
  initialMediaState,
  mediaReducer,
  nextZoom,
  type ZoomAction,
  type ZoomState,
} from "./mediaDisplay";
// The zoom keys are the SAME ⌘= / ⌘- / ⌘0 set the terminals use; reusing that one predicate
// keeps the key set in one place (chordRegistry's `terminal-font-zoom` row lists this outcome).
import { terminalZoomForChord } from "../terminalFontZoom";

// The SVG view-as-text pane reuses the read-only synthetic buffer (CM6), lazily, so a media tab
// only pulls CodeMirror in when the operator actually asks for the source.
const SyntheticView = lazy(() =>
  import("./SyntheticView").then((m) => ({ default: m.SyntheticView })),
);

interface MediaViewProps {
  root: string;
  path: string;
  kind: MediaKind;
  /**
   * Bumped by PaneTabs when an `fs-change` names this path (the SAME per-workspace listener the
   * text editor's disk check uses, via `EditorSplit.checkDiskForPaths`). Each bump re-stats;
   * a changed mtime/size re-fetches, a failure shows the "no longer on disk" card.
   */
  epoch?: number;
  /** Injectable for tests; defaults to the real `invoke`. */
  invoker?: Invoker;
}

export function MediaView({
  root,
  path,
  kind,
  epoch = 0,
  invoker,
}: MediaViewProps) {
  const [state, dispatch] = useReducer(mediaReducer, initialMediaState);
  // The review player's last position. Held HERE, not in the player, because a regenerate can
  // pass through a card (missing / unrenderable) that unmounts the player before the new file
  // loads, and the player must come back where it was (M16 WP3 AC-15).
  const playheadRef = useRef<Playhead | null>(null);

  useEffect(() => {
    let live = true;
    statMedia(root, path, invoker).then(
      (stat) => {
        if (live) dispatch({ type: "stat-ok", kind, stat });
      },
      (err) => {
        if (live) dispatch({ type: "stat-fail", message: String(err) });
      },
    );
    return () => {
      live = false;
    };
    // `epoch` is a dependency on purpose: it is the reload trigger, not a value read here.
  }, [root, path, kind, invoker, epoch]);

  const onRenderError = useCallback(
    () => dispatch({ type: "render-error" }),
    [],
  );

  if (state.status === "loading") {
    return <div className="media-loading" data-testid="media-loading" />;
  }
  if (state.status === "failed") {
    return (
      <div className="editor-error" data-testid="editor-error">
        <p className="editor-error-title">Could not open {path}</p>
        <p className="editor-error-detail">{state.message}</p>
      </div>
    );
  }
  const { stat, display } = state;
  if (display.kind === "card") {
    return (
      <MediaCard
        root={root}
        path={path}
        reason={display.reason}
        size={stat.size}
        invoker={invoker}
      />
    );
  }
  if (display.kind === "pdf") {
    return <PdfView stat={stat} path={path} />;
  }
  if (display.kind === "player") {
    return (
      <MediaPlayer
        stat={stat}
        path={path}
        media={display.media}
        onRenderError={onRenderError}
        playheadRef={playheadRef}
      />
    );
  }
  if (display.kind === "svg") {
    return (
      <SvgView
        root={root}
        stat={stat}
        path={path}
        invoker={invoker}
        onRenderError={onRenderError}
      />
    );
  }
  return (
    <ImageView
      stat={stat}
      path={path}
      testId="media-image"
      onRenderError={onRenderError}
    />
  );
}

/**
 * A PDF in WebKit's native viewer, over the asset URL. ⚠️ The ONLY `<iframe>` any media view
 * builds, and only reachable for a `display.kind === "pdf"`, which `displayFor` produces only
 * when the backend saw `%PDF-` at byte 0. A rendered guard (mediaNoScriptElements.test.tsx) pins
 * both halves.
 */
function PdfView({ stat, path }: { stat: MediaStat; path: string }) {
  return (
    <div className="media-view" data-testid="media-pdf">
      <div className="media-toolbar">
        <span className="media-readout" data-testid="media-readout">
          {[formatBytes(stat.size), "PDF", path].join(" · ")}
        </span>
      </div>
      <iframe
        className="media-pdf-frame"
        src={assetUrlFor(stat)}
        title={path}
      />
    </div>
  );
}

interface SvgViewProps {
  root: string;
  stat: MediaStat;
  path: string;
  invoker?: Invoker;
  onRenderError: () => void;
}

/**
 * An SVG: rendered through `<img>` ONLY (which never runs the file's script — WP1 measured the
 * same file running its script inside `<object>`), with a view-as-text toggle that shows the
 * source read-only. Editing the SVG as text stays the job of a normal text tab (spec A-6).
 */
function SvgView({ root, stat, path, invoker, onRenderError }: SvgViewProps) {
  const [asText, setAsText] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  // (Re)read the source when the toggle is on, and again when the file changes on disk.
  useEffect(() => {
    if (!asText) return;
    let live = true;
    readTextFile(root, path, invoker).then(
      (t) => {
        if (live) {
          setText(t);
          setTextError(null);
        }
      },
      (err) => {
        if (live) setTextError(String(err));
      },
    );
    return () => {
      live = false;
    };
  }, [asText, root, path, invoker, stat.mtime_ms]);

  const toggle = (
    <button
      type="button"
      className={`media-zoom-btn${asText ? " is-active" : ""}`}
      data-testid="media-svg-text-toggle"
      aria-pressed={asText}
      onClick={() => setAsText((v) => !v)}
      title={asText ? "Show the image" : "Show the SVG source (read-only)"}
    >
      Text
    </button>
  );

  if (!asText) {
    return (
      <ImageView
        stat={stat}
        path={path}
        testId="media-svg"
        onRenderError={onRenderError}
        extraControls={toggle}
      />
    );
  }
  return (
    <div className="media-view" data-testid="media-svg-text">
      <div className="media-toolbar">
        <span className="media-readout" data-testid="media-readout">
          {[formatBytes(stat.size), "SVG source (read-only)", path].join(" · ")}
        </span>
        <span className="media-zoom-controls">{toggle}</span>
      </div>
      {textError ? (
        <div className="editor-error" data-testid="editor-error">
          <p className="editor-error-title">Could not read {path}</p>
          <p className="editor-error-detail">{textError}</p>
        </div>
      ) : text === null ? (
        <div className="media-loading" />
      ) : (
        <Suspense fallback={<div className="media-loading" />}>
          <SyntheticView content={text} />
        </Suspense>
      )}
    </div>
  );
}

interface ImageViewProps {
  stat: MediaStat;
  path: string;
  testId: string;
  onRenderError: () => void;
  /** Extra toolbar controls, before the zoom buttons (the SVG text toggle). */
  extraControls?: ReactNode;
}

/** The glance viewer: fit by default, zoom in/out, 1:1, and a one-line readout. An SVG is
 *  shown through `<img>` ONLY, which never runs the file's script. */
function ImageView({
  stat,
  path,
  testId,
  onRenderError,
  extraControls,
}: ImageViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState<ZoomState>({ mode: "fit" });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const apply = useCallback((action: ZoomAction) => {
    const img = imgRef.current;
    const fitScale =
      img && img.naturalWidth > 0
        ? img.getBoundingClientRect().width / img.naturalWidth
        : 1;
    setZoom((z) => nextZoom(z, action, fitScale));
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const action = terminalZoomForChord(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    apply(action);
  };

  const imgStyle =
    zoom.mode === "fit" || !natural
      ? undefined
      : { width: natural.w * zoom.scale, maxWidth: "none", maxHeight: "none" };

  return (
    // Focusable so the zoom chords reach it: nothing else handles ⌘= / ⌘- / ⌘0 while the right
    // half is focused outside a terminal (Workspace.tsx's router steps aside), and a media tab
    // has no CodeMirror keymap to claim them.
    <div
      className="media-view"
      data-testid={testId}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div className="media-toolbar">
        <span className="media-readout" data-testid="media-readout">
          {[
            natural ? `${natural.w} × ${natural.h}` : null,
            formatBytes(stat.size),
            extensionOf(path).toUpperCase(),
            path,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="media-zoom-controls">
          {extraControls}
          <button
            type="button"
            className="media-zoom-btn"
            data-testid="media-zoom-out"
            onClick={() => apply("out")}
            title="Zoom out (⌘-)"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className={`media-zoom-btn${zoom.mode === "fit" ? " is-active" : ""}`}
            data-testid="media-zoom-fit"
            onClick={() => apply("reset")}
            title="Fit to pane (⌘0)"
          >
            Fit
          </button>
          <button
            type="button"
            className={`media-zoom-btn${zoom.mode === "scale" && zoom.scale === 1 ? " is-active" : ""}`}
            data-testid="media-zoom-actual"
            onClick={() => apply("actual")}
            title="Actual size"
          >
            1:1
          </button>
          <button
            type="button"
            className="media-zoom-btn"
            data-testid="media-zoom-in"
            onClick={() => apply("in")}
            title="Zoom in (⌘=)"
            aria-label="Zoom in"
          >
            +
          </button>
          <span className="media-zoom-level" data-testid="media-zoom-level">
            {zoom.mode === "fit" ? "fit" : `${Math.round(zoom.scale * 100)}%`}
          </span>
        </span>
      </div>
      <div
        className={`media-stage${zoom.mode === "fit" ? " is-fit" : ""}`}
        data-testid="media-stage"
      >
        <img
          ref={imgRef}
          className="media-img"
          src={assetUrlFor(stat)}
          alt={path}
          style={imgStyle}
          draggable={false}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onError={onRenderError}
        />
      </div>
    </div>
  );
}
