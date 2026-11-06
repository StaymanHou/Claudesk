import type { ReactNode } from "react";

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
  /** M10.9 WP3 — briefly flash this group (the invite routed the user here). */
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <section
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
