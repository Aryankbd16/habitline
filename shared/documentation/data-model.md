# Shared data model reference

This documents the logical habit-tracking data model so that the web app,
the Android module, and any future backend stay consistent. It is
descriptive documentation, not shared executable code (Phase 1 doesn't wire
the two platforms together). See `android/README.md` for the Android storage boundary.

## Habit

| Field         | Type                              | Notes                                             |
|---------------|------------------------------------|----------------------------------------------------|
| id            | string (uuid)                      | Stable across future sync                          |
| name          | string                              |                                                      |
| description   | string                              | optional                                            |
| category      | string                              | e.g. Study, Fitness, Health, Career, Personal       |
| icon          | string (emoji)                     |                                                      |
| type          | `"binary"`                         | Reserved for future: quantity, duration, repetition, avoidance |
| frequency     | `{ type: "daily" }` or `{ type: "weekly", days: number[] }` | `days`: 0=Sun ... 6=Sat |
| startDate     | string `yyyy-MM-dd`                |                                                      |
| points        | number ≥ 0                         |                                                      |
| priority      | `"low" \| "medium" \| "high"`      |                                                      |
| reminderTime  | string `HH:mm` or null             | not yet wired to notifications in Phase 1           |
| isArchived    | boolean                            |                                                      |

## Completion

| Field       | Type                | Notes                                    |
|-------------|---------------------|-------------------------------------------|
| habitId     | string              |                                            |
| date        | string `yyyy-MM-dd` | One record max per (habitId, date)        |

## Calculation rules (must match exactly across platforms)

- **Habit Completion %** = completed scheduled habits ÷ total scheduled
  habits for the period, ×100.
- **Weighted Focus Score** = points earned ÷ points possible for the
  period, ×100. Kept separate from Completion % — see spec section 12.
- **Current streak**: walk backward day by day from today (or yesterday, if
  today is scheduled but not yet completed); count consecutive scheduled
  days that were completed; stop at the first scheduled-but-incomplete day.
- **Longest streak**: same rule, applied across the full history, tracking
  the maximum run length seen.

Reference implementations:
- Web: `web/src/lib/calculations.js`
- Android: `android/app/src/main/java/com/habitline/data/HabitRepository.kt`
  (`currentStreak`)

## Stage 2 SQLite history

- `sessions` stores hashed opaque session tokens, account IDs and expiry timestamps. Browsers receive the opaque token in an HttpOnly cookie.
- `habits.schedule_history` stores prior start dates, weekday schedules, archive flags and point weights. Each entry is effective up to but excluding its `until` local date. Multiple edits on the same day use that day's final settings and retain the original prior schedule.
- `completions.points_earned` records the points at completion time. Migration backfills earlier records from the habit's available point value. Pre-migration point changes and missed schedules cannot be recovered from old records. Saved completion records remain visible even where older schedule details are unavailable.
- Relationship pairs are unordered associations with unique endpoints per account. The Related, Paired and Supports labels provide context. Completions remain independent.
- Archive retains schedule and completion history. Explicit permanent deletion removes the habit, its completions and its relationships in one transaction.

## Phase 3 goal and milestone models

A Goal has an account owner, title, description, positive integer completion target, local start date, optional target date, optional archive date, and a set of habit IDs. Goal and habit associations are unique per pair. Each qualifying habit/date completion contributes once per linked goal. A Milestone has an account owner, kind, subject ID, title and description snapshots, and an earned local date. The unique key is account, kind, and subject ID. Android can map its habit/day records to the completion model. Goal links, schedule revision history, completion point snapshots, and the milestone ledger require Android equivalents before feature parity.

## Phase 4 data model

`habits.xp_value` is separate from saved completion points. The append-only `xp_events` ledger records one award and at most one reversal per completion. Social profiles are account-keyed. Contacts use a canonical account pair and requester identity, and blocks are directional. Private group memberships carry a role and invitation state. Challenges use a scope, a date window and an individual target, with unique participant and owned habit links. Social posts reference an earned milestone and store a public caption without the private award title. The unique reaction key is post and account. See the [Phase 4 report](../../PHASE4-REPORT.md) for eligibility and privacy rules.
