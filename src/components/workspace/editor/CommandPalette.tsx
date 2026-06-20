// WP3b — the command-palette overlay (Cmd+Shift+P).
//
// A net-new React overlay over CM6's command set — CM6 ships no turnkey palette.
// It renders a filtered, keyboard-navigable list of PaletteCommands handed in by
// the parent (the command set is NOT hardcoded here, so future WPs add commands
// by passing more entries). Dark-only, palette-aligned to App.css.
//
// The chord that OPENS the palette is registered in the parent via the WP1
// capture-phase document listener (so it fires while focus is inside CM6); this
// component only handles in-overlay keys (filter typing, ↑/↓/Enter/Esc) and
// restores editor focus when it closes.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterCommands,
  PALETTE_CHORD_LABEL,
  type PaletteCommand,
} from "./paletteCommands";

interface CommandPaletteProps {
  /** The full command set to offer (filtered live as the user types). */
  commands: PaletteCommand[];
  /** Close the palette (Esc, blur-escape, or after running a command). */
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the filter on open so the user types immediately (Sublime parity).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // Keep the active index in range as the filtered list shrinks/grows.
  const active =
    filtered.length === 0 ? -1 : Math.min(activeIndex, filtered.length - 1);

  const runActive = () => {
    const cmd = filtered[active];
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (filtered.length > 0) {
          setActiveIndex((i) => (i + 1) % filtered.length);
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (filtered.length > 0) {
          setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        }
        break;
      case "Enter":
        e.preventDefault();
        runActive();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      data-testid="command-palette"
      // Click outside the panel closes (mousedown so it beats the input blur).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          type="text"
          className="command-palette-input"
          data-testid="command-palette-input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={`Type a command…  (${PALETTE_CHORD_LABEL})`}
          aria-label="command filter"
          spellCheck={false}
        />
        <ul className="command-palette-list" role="listbox">
          {filtered.length === 0 ? (
            <li
              className="command-palette-empty"
              data-testid="command-palette-empty"
            >
              No matching commands
            </li>
          ) : (
            filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                role="option"
                aria-selected={i === active}
                className={
                  "command-palette-item" +
                  (i === active ? " command-palette-item-active" : "")
                }
                data-testid={`command-palette-item-${cmd.id}`}
                // mousedown (not click) so the editor's blur doesn't fire first
                // and tear the overlay down before the command runs.
                onMouseDown={(e) => {
                  e.preventDefault();
                  cmd.run();
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {cmd.title}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
