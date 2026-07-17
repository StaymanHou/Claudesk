// M10 WP6 Phase 2 — a tiny clipboard-copy helper for the banner's Homebrew branch (the
// one-click-to-copy `brew upgrade claudesk` instruction). No new dependency: Tauri serves
// the app in a secure context, so `navigator.clipboard.writeText` is available in the
// WKWebView. Falls back to a hidden-textarea + execCommand for any context where the async
// Clipboard API is unavailable, and resolves a boolean so the caller can show/skip the
// "Copied!" affordance. Never throws — a copy failure is a soft no-op (the text is still
// visible for manual selection).

/** The exact command a Homebrew user runs to update — the single source of truth for
 *  both the copied string and the displayed text. */
export const BREW_UPGRADE_CMD = "brew upgrade claudesk";

/**
 * Copy `text` to the clipboard. Returns `true` on success, `false` on any failure (so the
 * caller can decide whether to flash "Copied!"). Tries the async Clipboard API first, then
 * a synchronous textarea/execCommand fallback. Never throws.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Preferred: the async Clipboard API (available in the WKWebView secure context).
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  // Fallback: a hidden textarea + document.execCommand("copy"). Works without the async
  // API / secure-context requirement. Guarded for non-DOM (test) environments.
  try {
    if (typeof document === "undefined") return false;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
