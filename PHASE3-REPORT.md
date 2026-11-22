# Habitline Phase 3 implementation

## Baseline

The Phase 2 code already provided cookie-backed session authorization, account-scoped habits and relationships, unique habit/day completions, schedule history, saved points, and an API-backed PWA. Its Analytics page offered fixed recent trends and rolling comparisons. Goals and durable achievements were absent. See [the implementation plan](PHASE3-PLAN.md).

## Analytics and insights

- Calendar weeks begin Monday. Month views use calendar months. Current periods end today in the browser's local time zone. The previous-period comparison uses the same number of elapsed days, shortened to the shorter month when necessary.
- Completion rate and consistency use completed occurrences divided by scheduled opportunities. With zero opportunities the UI displays an em dash. Today's scheduled opportunities appear in the rate and an unfinished occurrence counts as missed after the day ends.
- Historical schedules use the recorded schedule version effective on that date. A persisted completion from before reliable schedule snapshots remains visible and represents one known opportunity. Future-dated rows are excluded. Archived habits remain selectable and have no active streak.
- Streaks count consecutive scheduled occurrences. For all habits the current and longest values are the maximum individual streaks. Earned points use saved completion points where available. Focus score uses points earned divided by points possible.
- Weekly and monthly changes use percentage points. Insights require three or more opportunities in each matched period and a change of at least ten percentage points to report movement. Stable monthly observations show counts at 80% or higher or 40% or lower. A streak insight requires seven consecutive occurrences. Duplicate observations for the same evidence window and habit are suppressed.
- Custom focus categories and explicit priority order are stored using the existing profile endpoint and influence dashboard section order, the analytics habit list and the order of habit observations.

## Goals and milestone rules

A goal counts each persisted completion for a currently linked habit once. The date window is inclusive from the start date through the earliest of today, the target date, or the archive date. Progress is the count divided by target, rounded down to a whole percentage and capped at 100%. An association can contribute to multiple goals independently. Editing dates or linked habits and undoing a completion can change active progress. The earned milestone survives those edits.

Milestones record the date of the seventh or thirtieth logged completion, the first seventh consecutive scheduled occurrence, or the date of the completion that reached a goal target. Each award is unique per account, type, and subject. Awarded titles and descriptions are snapshots. Individual habit or goal deletion preserves existing awards. The explicit account data reset clears them. Milestones are checked on completion writes, goal writes, import, and the milestone history request for older data.

## API and persistence

| Method and path | Behavior |
| --- | --- |
| GET /api/goals | List the signed-in account's goals, links, and computed progress |
| POST /api/goals | Create a goal and replace its link set atomically |
| PATCH /api/goals/:goalId | Edit, archive, restore, or update linked habits |
| DELETE /api/goals/:goalId | Delete an owned goal and its associations |
| GET /api/milestones | Backfill and list earned milestones for the signed-in account |

The existing completion write returns the saved record so routine tracking does not require fetching all history again. All new routes reuse Phase 2 sessions and validation/error conventions. Goal links are accepted only for habits owned by the goal owner.

The startup migration adds `goals`, `goal_habits`, and `milestones` with account and lookup indexes. It is additive and repeatable. SQLite foreign keys enforce link cleanup. The verified pre-migration checkpoint is `data/habit_tracker.db.before-phase3.bak`. Migration and integrity were tested against a copy of the existing database.

## Changed files

| File | Change |
| --- | --- |
| `server/progress.cjs` | Goal and milestone schema, routes, calculations and transaction hooks |
| `server/index.cjs` | Register new routes and integrate awards, resets and completion responses |
| `web/src/lib/progress.js` | Calendar windows and indexed progress calculations |
| `web/src/lib/insights.js` | Deterministic observations and evidence thresholds |
| `web/src/lib/calculations.js` | Shared streak calculation and threshold dates |
| `web/src/lib/personalization.js` | Ordered custom categories and shared section priorities |
| `web/src/lib/goalService.js` | Authenticated goal and milestone API calls |
| `web/src/context/HabitsContext.jsx` | Apply the persisted completion mutation response to account state |
| `web/src/pages/Analytics.jsx` | Upgrade the existing analytics screen and add habit drill-down |
| `web/src/pages/Goals.jsx` | Goal creation, editing, archiving, deletion and progress |
| `web/src/pages/Profile.jsx` | Edit priority order and custom categories and show milestone history |
| `web/src/components/MilestoneHistory.jsx` | Earned history and loading, empty and error states |
| `web/src/components/HabitCard.jsx` | Link directly to individual analytics |
| `web/src/components/AppShell.jsx` and `web/src/App.jsx` | Add Goals navigation and routing |
| `tests/phase3.test.cjs` | Calculation, insight, persistence, migration, isolation and award tests |
| `tests/stage2-browser.cjs` | Extend the existing smoke test to cover Phase 3 |
| `README.md` and `shared/documentation/data-model.md` | Document behavior and compatibility |
| `PHASE3-PLAN.md` and `PHASE3-REPORT.md` | Record implementation plan and decisions |
| `data/habit_tracker.db.before-phase3.bak` | Pre-migration database checkpoint |

## Android and remaining limits

The Kotlin companion and widget use a separate SharedPreferences store with matching habit/date completion keys and weekday conventions. It can represent basic completion counts and date sequences. Schedule revisions, saved points, goals and durable milestones would need Android model and storage changes before equivalent local reporting or synchronized data can be supported. No Android source or widget interfaces were changed. The environment has no Gradle wrapper, installed Gradle, or Android SDK for APK/device verification.

JSON exports continue to cover habits, completions, and relationships. Use the SQLite database backup for a full copy that includes goals and earned milestones. Historical schedule versions missing from the original data remain unrecoverable. No external AI service is used.
