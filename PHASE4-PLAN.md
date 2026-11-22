# Phase 4 implementation plan

## Baseline audit

React owns the active habit snapshot, with server-confirmed mark and undo. Express mounts Goals in progress.cjs and exposes cookie-authenticated, account-scoped routes. SQLite stores unique habit/day rows, saved point values and schedule revisions. The Phase 3 milestone table already provides unique, durable award snapshots. Kotlin and its widget share a separate on-device store. The checkout contains no Git metadata.

The live Goals route returned JSON 401 through Vite and the disposable Edge suite passed Goals, authenticated creation, completion and undo before Phase 4 edits. The previously reported stale-process symptoms required no further application changes.

## Sequence and acceptance criteria

1. Back up the live database through SQLite's online backup API. Test additive migrations on disposable copies and leave the running live database unchanged.
2. Add an auditable XP ledger with unique completion awards and reversals. Reuse milestone snapshots for levels, badges and schedule-aware streak awards. Verify points and historical imports retain their existing behavior.
3. Add date-bounded personal challenges with owned habit links, archive and restore. Calculate progress from persisted records.
4. Add opt-in discoverability, privacy, friend requests, blocking and private groups with explicit permissions.
5. Add invitation-based challenges with participants' own habit links. Verify scope, trust only persisted eligible completions, and screen private relationships in rankings and feed projections.
6. Add period leaderboards, reactions, notifications and locally generated share cards. Keep disclosure opt-in, avoid private content in public projections, and throttle discovery and social writes.
7. Integrate a single Progress hub, verify both separate-account API and browser flows, rerun regressions/build/lint, and document deployment and Android boundaries.

## Risks and dependencies

Use the existing Node, SQLite, React and browser libraries. XP writes and reversals must share the completion transaction. All participant and membership changes require account checks. Group invites are restricted to current friends. Blocking removes direct relationships and prevents future pair interactions; private group projections also filter blocked accounts. Social competition counts tracked completions only to keep JSON imports out of leaderboards and social challenge progress. No external infrastructure is required.
