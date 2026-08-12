<!-- Part of the Claudesk architecture set. Index + load-bearing constraints: ../arch.md -->
# Time analytics

**Moved to** [`archive/milestone-9-time-analytics/arch-as-built-m9.md`](../archive/milestone-9-time-analytics/arch-as-built-m9.md) on 2026-08-03 (size guard; that dir already held two arch-grade companion docs, so the detail belongs there). **The load-bearing rules stay here:**

- **SQLite is a scoped exception** to the project's no-database rule — time-series aggregation only; see "### Key Decisions".
- ⚠️ **Session END must be MEASURED, not assumed** — 4 signals with a precedence order; a dangling burst inflated a duration to 885 min.
- ⚠️ **Aggregate-duration consumers must clip events at `resolve_session_end` FIRST** — the cap lives in the CALLER (`build_viz_session`/`build_metrics`), not the primitives, which return RAW bursts.
- ⚠️ **Mount scope must match data scope** — a component mounted wider than its data window reads stale.
- **`time_tracking_enabled` (default OFF) is the write gate** — and it is the template M10.9's feature gate was modeled on.

