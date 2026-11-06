// Shared time formatting (paydown 2026-11-04 WP8). Pure, no React. It moved out of the diff
// viewer's model once the supervisor readout and activity popover needed it too, so a pure
// readout module no longer depends on `components/workspace/diff`.

/**
 * Format an epoch-seconds timestamp as a coarse relative time ("3h ago", "2d ago",
 * "just now"). Pure given `now` (epoch seconds) so it's testable without a clock; callers pass
 * `Date.now() / 1000` (or a held `nowMs / 1000`) at render. Future times clamp to "just now"
 * (clock skew between a recorded time and the local clock).
 */
export function relativeTime(epochSecs: number, nowSecs: number): string {
  const delta = Math.max(0, nowSecs - epochSecs);
  if (delta < 60) return "just now";
  const mins = Math.floor(delta / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
