# Habitline Stage D audit

## Rule sources

| Area | Authoritative code | Android decision |
| --- | --- | --- |
| Analytics | [Web calculations](../web/src/lib/calculations.js), [period engine](../web/src/lib/progress.js), [Analytics screen](../web/src/pages/Analytics.jsx) | Periods start Monday or on the first local day of the month. Today caps the interval. Comparisons use the shorter elapsed span. Persisted marks count as known opportunities, including marks from older data with incomplete schedule history. Historical schedules and saved points carry their own values. Null rates and zero possible points display an em dash. |
| Insights | [Web insights](../web/src/lib/insights.js) | Each comparison requires three opportunities in both periods. Integer cross products test the unrounded 10-point boundary. Monthly observations use the same 80% and 40% bounds. Current streak insights start at seven occurrences. Archived habits remain available as historical analytics filters. |
| Goals | [Backend goals and milestones](../server/progress.cjs) | The current linked-habit set supplies distinct habit/day marks. Windows are inclusive, percent is floored and capped, and a goal award snapshots the date the target was reached. The backend query caps at today, target date and the goal's archive date. The Stage D brief also requires a per-habit archive cutoff, which Android applies while that habit remains archived. A known mark dated after archive can therefore differ between platforms. |
| XP | [Backend game](../server/game.cjs) | Award amounts range from 0 to 100. The first award fixes the amount for the habit and local date. Undo reverses the exact transaction, and a new mark creates its own award with that original amount. Levels use the same triangular formula and the web default step of 100. Android has a local default and the server can supply a different value through its environment. |
| Awards | [Phase 3 rules](../server/progress.cjs), [Phase 4 rules](../server/game.cjs) | Habit totals, scheduled streaks, tracked completion badges, levels, goals and challenges use unique immutable snapshots. Legacy marks count toward applicable historical totals and streaks. They earn zero new XP. |
| Personal challenges | [Backend challenges](../server/challenges.cjs) | Count mode includes known marks from all current links, and streak mode uses one habit's historical schedule. Both use inclusive dates and the challenge archive cutoff. Mode stays fixed once created. Android supports permanent local deletion at the user's request. The backend uses archive for owner-managed challenges. |

## Stage C data and migration

Room v1 already includes the goal, challenge, link, XP and milestone tables and unique indexes used here. The entity declarations and exported Room v1 schema stay byte-for-byte compatible with Stage C. Stage D adds a DAO and uses the existing shared-preferences migration. It records a per-profile award-backfill flag in the existing preference table. Award backfill and that flag commit together. The original saved marks, XP rows, schedules, profile and widget bindings are read through Room.

Stage C accumulated reversible XP before it had an achievements interface. Its ledger can recover historical level and tracked-completion awards. Habit streaks and habit completion totals are reconstructed from surviving date records. Earlier undone marks can leave insufficient evidence to reconstruct a historical streak precisely.

## Shared challenges and social features

The web API uses account-scoped SQLite records and revocable `habitline_session` cookies. In production the cookies are Secure, HttpOnly and scoped to `/api`. Mutations rely on the same-origin write checks in the Express app. Shared challenges require invitations, membership and server-side scoring. Friend discovery, blocking, group access, rankings, feeds and reactions enforce account and relationship privacy in the backend. [Express entry point](../server/index.cjs), [social routes](../server/social.cjs), [challenge routes](../server/challenges.cjs).

Express binds to laptop loopback by default. The Android debug APK is offline and its hosted build checks the packaged permissions for Internet access. Stage F needs an authenticated HTTPS LAN endpoint, explicit setup and identity pairing, protected session storage, revocation, and replay-safe reconciliation of completion and XP data. Local records remain authoritative for Stage D. Shared challenges, social profiles, search, friends, blocking, private groups, group invitations, standings, feeds and reactions remain in the web app.

## Lint and compliance

The verified Stage C report has 52 lint warnings. They cover dependency updates, target API and kapt, duplicated or unused launcher assets, widget decoration and API-specific sizes, layout overdraw, unused resources, translation candidates and a calendar formatting call. Stage D replaces the calendar label concatenation with a resource format and uses separate plural forms for percentage-point labels. Charts have a textual daily breakdown. The workflow still runs the full lint ruleset. Hosted lint passed on `8ffcbcc` with zero errors and 52 warnings. The calendar `SetTextI18n` warning was removed and a `ViewConstructor` warning was introduced by the new programmatic chart. The local correction uses a standard `Context` constructor and supplies the chart series separately. The exact warning count for the correction requires a hosted rerun. [Stage D lint report](https://github.com/Aryankbd16/habitline/actions/runs/46116360549/artifacts/15252182020).

The work is scoped to Android, shared fixtures, tests, CI and implementation records. Existing server and web calculation code remain the parity reference.
