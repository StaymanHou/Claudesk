import { useEffect, useRef, type ReactNode } from "react";

/** One labelled settings group. The label + help line are the affordance a flat
 *  unlabelled strip could not offer — and the reason the gate has somewhere to explain
 *  its `~/.claude/` dependency. */
export function SettingsGroup({
  id,
  title,
  hint,
  highlighted = false,
  children,
}: {
  id: string;
  title: string;
  hint: string;
  /** M10.9 WP3 — briefly flash this group (the invite routed the user here). M18 WP5: and
   *  scroll it into view, since a routed-to group can sit below the fold (Remote hosts). */
  highlighted?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    // `?.()`: jsdom has no `scrollIntoView`. "nearest" scrolls only when the group is not
    // already fully in view, so a group at the top does not jolt the panel.
    if (highlighted) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [highlighted]);
  return (
    <section
      ref={ref}
      className={`settings-group${highlighted ? " settings-group-highlight" : ""}`}
      data-testid={`settings-group-${id}`}
      data-highlighted={highlighted ? "true" : undefined}
    >
      <h3 className="settings-group-title">{title}</h3>
      <p className="settings-group-hint">{hint}</p>
      <div className="settings-group-body">{children}</div>
    </section>
  );
}
