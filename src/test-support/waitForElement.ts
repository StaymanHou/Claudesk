import { act } from "react";

// Wait for an element that a previous step renders asynchronously, instead of assuming a fixed
// `settle()` was long enough. Under full-suite load a fixed delay can fall short, and the next
// step then works on `null`.

/**
 * Resolve with the first element matching `selector`, polling every 10 ms inside `act` so React
 * work flushes between polls. Rejects after `timeoutMs` with an error naming the selector.
 */
export async function waitForElement<T extends Element = HTMLElement>(
  selector: string,
  timeoutMs = 2000,
  root: ParentNode = document,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const el = root.querySelector<T>(selector);
    if (el) return el;
    if (Date.now() >= deadline) {
      throw new Error(
        `waitForElement: ${selector} did not appear within ${timeoutMs} ms`,
      );
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}
