// M16 WP2 — the info card: what the editor tab shows for any file it cannot display.
//
// One component for every reason (an unplayable element, a binary, a file over a size cap,
// audio/video at or over 4 GiB, a fake PDF). It always offers "Open in default app" (R-4b),
// the escape hatch that makes a refusal a one-click detour instead of a dead end.

import { useEffect, useState } from "react";
import { openInDefaultApp, statFile, type Invoker } from "./mediaIpc";
import { basenameOf, extensionOf } from "./mediaKind";
import { CARD_REASON_TEXT, formatBytes, type CardReason } from "./mediaDisplay";

interface MediaCardProps {
  /** Workspace root (the `stat_file` / `open_in_default_app` root). */
  root: string;
  /** The tab's path, as the editor opened it. */
  path: string;
  reason: CardReason;
  /** File size in bytes, when known. */
  size?: number | null;
  /** Injectable for tests; defaults to the real `invoke`. */
  invoker?: Invoker;
}

export function MediaCard({
  root,
  path,
  reason,
  size,
  invoker,
}: MediaCardProps) {
  const ext = extensionOf(path);
  return (
    <div className="media-card" data-testid="media-card" data-reason={reason}>
      <p className="media-card-name">{basenameOf(path)}</p>
      <p className="media-card-meta" data-testid="media-card-meta">
        {[
          size != null ? formatBytes(size) : null,
          ext ? ext.toUpperCase() : "file",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <p className="media-card-reason">{CARD_REASON_TEXT[reason]}</p>
      <button
        type="button"
        className="media-card-open"
        data-testid="media-card-open"
        onClick={() => void openInDefaultApp(root, path, invoker)}
      >
        Open in default app
      </button>
    </div>
  );
}

/**
 * The card for a `read_file` refusal (`not-utf8` / `too-large`), which arrives with no stat.
 * It fetches the size itself so the card reads the same as a media file's; a failed stat
 * just leaves the size off. ⚠️ Through `stat_file`, not `stat_media`: this card builds no asset
 * URL, so it must not admit the root to the asset scope.
 */
export function ReadErrorCard({
  root,
  path,
  reason,
  invoker,
}: Omit<MediaCardProps, "size">) {
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    statFile(root, path, invoker).then(
      (s) => {
        if (live) setSize(s.size);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [root, path, invoker]);
  return (
    <MediaCard
      root={root}
      path={path}
      reason={reason}
      size={size}
      invoker={invoker}
    />
  );
}
