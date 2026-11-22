# Phase 3 implementation plan

Phase 2 has authenticated SQLite routes, completion uniqueness, schedule snapshots, React context, Recharts, personalization, backup and a separate SharedPreferences Android companion. Analytics uses rolling summaries and a fixed trend, with no comparable calendar-period breakdown or goal and achievement models. This checkout has no Git metadata.

1. Extend the existing calculation layer with comparable calendar periods, schedule-aware opportunity counts and per-habit history.
2. Derive insights from eligible periods and respect the user's category order.
3. Add goals, unique habit associations and durable achievement snapshots in SQLite.
4. Integrate the existing analytics screen, dashboard links, goals screen and profile milestone history.
5. Verify copied-database migration, API isolation, progress rules, browser flows and production build. Document the Android boundary.
