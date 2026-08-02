// M11 WP3 — the Docs panel's delegated link-click handler, extracted so it can be tested
// AS THE REAL CODE.
//
// ── Why this is a module and not a closure inside DocsPanel ─────────────────────
// It lived inline, and its central invariant ("no click in rendered doc content may ever
// perform its default action") was guarded twice — both times by something that could not
// see the bug:
//
//   1. A `?raw` source-order guard comparing the positions of `preventDefault()` and the
//      `external` branch. Blind to an early return sitting between them. It passed while
//      `[click]()` — a live `<a href="">` — reloaded the app shell.
//   2. Its replacement counted `return` tokens above `preventDefault()`. Also a PROXY:
//      folding the empty-href bail into the anchor guard keeps the count at 1 and passes,
//      reopening the identical hole. Measured at code review, with the full 1645-test
//      suite green.
//
// Both failures share one cause: **the property is behavioral and was being asserted
// structurally.** A source-text predicate can only encode the shapes you thought of. So the
// handler now lives here as a factory over its dependencies, and `docsLinkHandling.test.ts`
// imports and drives THIS function with real DOM events — mutating the real code, not a
// copy of it. That is the difference the review named: probe the component, not the replica.

import { openUrl } from "@tauri-apps/plugin-opener";
import type { DocEntry } from "../docsOrder";
import { anchorSelector, classifyHref } from "./classifyHref";
import { resolveDocLink } from "./resolveDocLink";

/** The minimal event surface the handler touches.
 *
 * Deliberately structural rather than `MouseEvent` or React's `MouseEvent<T>`: the handler
 * reads `target` and calls `preventDefault()`, nothing else. Typing it this way lets the
 * SAME function accept React's synthetic event in production and a real DOM event in tests
 * — which is the whole point of the extraction. A concrete type would force a cast at one
 * end or the other, and a cast is exactly where a "tested the copy, not the code" gap
 * creeps back in.
 */
export interface DocLinkClickEvent {
  target: EventTarget | null;
  preventDefault: () => void;
}

/** Everything the handler needs from the component, injected so it stays drivable. */
export interface DocLinkClickDeps {
  /** The doc currently rendered — the base a relative link resolves against. */
  selected: string | null;
  /** The discovered doc set, or `null` before the list has loaded. */
  docs: readonly DocEntry[] | null;
  /** The scroll container's ref. In-doc anchors are located within it.
   *
   * A REF, not a getter returning `.current`: a getter closing over `ref.current` is read
   * during render at the call site, which `react-hooks/refs` correctly rejects. Taking the
   * ref object defers every read to click time, where it belongs. */
  containerRef: { current: HTMLElement | null };
  /** Show (or clear, with `null`) the one-line link note. */
  setLinkNote: (note: string | null) => void;
  /** Switch the selected doc. */
  setChosen: (relPath: string) => void;
  /** Open an external URL outside the webview. Injected for testability. */
  openExternal?: (url: string) => Promise<void>;
}

/**
 * Build the delegated click handler for the rendered-doc container.
 *
 * ⚠️ **`preventDefault()` runs for EVERY anchor click, before classification and before any
 * early return.** Once `closest("a[href]")` matches, the click is on a link inside document
 * content and its default action must never fire — Claudesk's window has no back button, so
 * a navigated-away webview is unrecoverable. An empty href is the case that makes this
 * non-obvious: it looks like "nothing to do", but in a WKWebView it navigates to the current
 * URL and reloads the app shell.
 */
export function makeDocLinkClickHandler(
  deps: DocLinkClickDeps,
): (e: DocLinkClickEvent) => void {
  const openExternal = deps.openExternal ?? ((url: string) => openUrl(url));

  return (e: DocLinkClickEvent) => {
    const anchor = (e.target as HTMLElement).closest?.("a[href]");
    // The ONLY return permitted above preventDefault: the click was not on a link at all,
    // so we have not committed to handling it. Adding any other condition here re-opens
    // the hole described in the module header.
    if (!(anchor instanceof HTMLAnchorElement)) return;

    // Read the AUTHORED href, not `anchor.href` — the DOM property resolves relative URLs
    // against the page origin, turning `wbs.md` into `http://localhost:1420/wbs.md`, which
    // would make every cross-doc link classify as external.
    const href = anchor.getAttribute("href") ?? "";

    e.preventDefault();

    const kind = classifyHref(href);
    // Nothing actionable, but the default action is already blocked above.
    if (kind === "empty") return;

    if (kind === "external") {
      // Clear any stale note first: a successful navigation of ANY kind should not leave
      // the previous link's message on screen (observed live at Phase 3 verify-self — a
      // "not one of this project's docs" note persisted through a later successful
      // external open, making the successful click look like it had failed).
      deps.setLinkNote(null);
      // Failure is surfaced, not swallowed: a silently dead link is indistinguishable
      // from a broken handler.
      void openExternal(href).catch((err: unknown) => {
        deps.setLinkNote(`Could not open ${href}: ${String(err)}`);
      });
      return;
    }

    if (kind === "anchor") {
      deps.setLinkNote(null);
      scrollToFragment(deps.containerRef.current, href);
      return;
    }

    // cross-doc: resolve against the doc it was written in, then switch the selection.
    if (deps.selected === null || deps.docs === null) return;
    const resolved = resolveDocLink(href, deps.selected, deps.docs);
    if (resolved.kind === "not-in-set") {
      // Deliberately visible. `CHANGELOG.md` / `README.md` are real files that are NOT in
      // the curated doc set, so this is reachable in normal use — and a click that does
      // nothing at all reads as a broken panel.
      deps.setLinkNote(
        `Not one of this project's workflow docs: ${resolved.attempted}`,
      );
      return;
    }
    deps.setLinkNote(null);
    deps.setChosen(resolved.relPath);

    // ⚠️ The fragment of a cross-doc link (`wbs.md#probe-outcomes`) — land on the SECTION,
    // not merely the file. `resolveDocLink` has always split this off and the caller always
    // dropped it, so such links silently landed at the top while the module's own comment
    // said otherwise (caught at code review — a comment promising behavior the code did not
    // perform is worse than an unimplemented feature).
    //
    // Deferred by a frame because the target document has not rendered yet: `setChosen`
    // only schedules the switch, and its content arrives after an async `docs_read`. A
    // single rAF is not enough, so this polls briefly and gives up quietly — a missed
    // scroll is a minor annoyance, a hang is not.
    if (resolved.fragment !== null) {
      scrollToFragmentWhenPresent(deps.containerRef, `#${resolved.fragment}`);
    }
  };
}

/** Scroll to `href`'s target within `container`, if the target exists. */
function scrollToFragment(container: HTMLElement | null, href: string): void {
  // `block: "start"` scrolls WITHIN the panel's own scroll box rather than the app shell.
  container?.querySelector(anchorSelector(href))?.scrollIntoView({
    block: "start",
  });
}

/** Poll briefly for a fragment target that has not rendered yet, then give up. */
function scrollToFragmentWhenPresent(
  containerRef: { current: HTMLElement | null },
  href: string,
  attemptsLeft = 20,
): void {
  const el = containerRef.current?.querySelector(anchorSelector(href));
  if (el) {
    el.scrollIntoView({ block: "start" });
    return;
  }
  if (attemptsLeft <= 0) return; // Bounded — never spins if the heading does not exist.
  setTimeout(
    () => scrollToFragmentWhenPresent(containerRef, href, attemptsLeft - 1),
    25,
  );
}
