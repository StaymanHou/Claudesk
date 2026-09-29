// M16 WP2 — the body of an editor `"file"` tab whose path is media (`mediaKind` non-null).
//
// PaneTabs renders this INSTEAD of EditorPanel, and does not register the path in the shared
// doc store, so no `read_file` ever runs for a media tab. There is no new TabKind: close,
// ⌘W, ⌘1–9, split and tree highlight all keep working on the ordinary file tab.
//
// Flow: `stat_media` (root-confined; also admits the root to the asset scope) → `displayFor`
// picks the view → the asset URL is built from the CANONICAL path the backend returned, never
// from the tab path, and cache-busted with the mtime so a regenerated file is not served stale.

import { convertFileSrc } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { MediaCard } from "./MediaCard";
import { statMedia, type Invoker, type MediaStat } from "./mediaIpc";
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

interface MediaViewProps {
  root: string;
  path: string;
  kind: MediaKind;
  /** Injectable for tests; defaults to the real `invoke`. */
  invoker?: Invoker;
}

/** The asset URL for a stat: canonical path, cache-busted by mtime. */
export function assetUrlFor(stat: MediaStat): string {
  return `${convertFileSrc(stat.path)}?v=${Math.round(stat.mtime_ms)}`;
}

export function MediaView({ root, path, kind, invoker }: MediaViewProps) {
  const [state, dispatch] = useReducer(mediaReducer, initialMediaState);

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
  }, [root, path, kind, invoker]);

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
  return (
    <ImageView
      stat={stat}
      path={path}
      testId={display.kind === "svg" ? "media-svg" : "media-image"}
      onRenderError={onRenderError}
    />
  );
}

interface ImageViewProps {
  stat: MediaStat;
  path: string;
  testId: string;
  onRenderError: () => void;
}

/** The glance viewer: fit by default, zoom in/out, 1:1, and a one-line readout. An SVG is
 *  shown through `<img>` ONLY, which never runs the file's script. */
function ImageView({ stat, path, testId, onRenderError }: ImageViewProps) {
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
