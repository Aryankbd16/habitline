# Habitline Stage 2 file changes

| File | Purpose |
| --- | --- |
| `server/index.cjs` | Add persistent sessions, validate writes, preserve schedule and completion-point history, scope imports, and return useful API errors. |
| `web/index.html` | Correct the app description to reflect API-backed operation. |
| `web/vite.config.js` | Route development and preview API calls to Express and exclude the API from service-worker navigation fallback. |
| `web/src/App.jsx` | Show a retry screen when the initial session check cannot reach the server. |
| `web/src/context/AuthContext.jsx` | Restore the cookie-backed session and report startup failures. |
| `web/src/context/HabitsContext.jsx` | Isolate account state, ignore stale reloads and send explicit completion states. |
| `web/src/context/ThemeContext.jsx` | Preserve the selected palette and apply theme-specific contrast through CSS. |
| `web/src/index.css` | Improve contrast of interactive accents and muted text in both themes. |
| `web/src/lib/api.js` | Add the write-verification header and handle transport and response errors. |
| `web/src/lib/authService.js` | Use cookie sessions and submit personalization during registration. |
| `web/src/lib/habitService.js` | Send account-scoped CRUD and completion requests using the browser's local date and time zone. |
| `web/src/lib/backupService.js` | Include habit relationships in JSON backup and restore. |
| `web/src/lib/calculations.js` | Share daily summaries, period rates, saved point totals and historical streak logic. |
| `web/src/lib/dateUtils.js` | Preserve fixed-width local date keys. |
| `web/src/lib/personalization.js` | Add relevant engineering and medical sections and preserve custom categories. |
| `web/src/lib/schedule.js` | Resolve the schedule effective on a date. |
| `web/src/lib/useToday.js` | Update the dashboard and reporting date at local midnight and on focus. |
| `web/src/components/AddHabitModal.jsx` | Support custom categories, weekday validation, archive and restore feedback. |
| `web/src/components/AppShell.jsx` | Show account data loading and retry states and tighten mobile navigation. |
| `web/src/components/ContributionGrid.jsx` | Align the first grid column using the local date's weekday. |
| `web/src/components/HabitCard.jsx` | Guard repeated completion clicks, display status and surface save errors. |
| `web/src/components/HabitRelationshipModal.jsx` | Show archived relationship endpoints and report removal failures. |
| `web/src/components/MonthCalendar.jsx` | Label month navigation and selected days and let the legend wrap. |
| `web/src/pages/Analytics.jsx` | Add completion trends, rolling comparisons, saved points and per-habit streaks. |
| `web/src/pages/CalendarPage.jsx` | Render persisted historical summaries, completion states and saved rewards. |
| `web/src/pages/Dashboard.jsx` | Show prioritized sections, consistent daily metrics and access to every habit. |
| `web/src/pages/Login.jsx` | Allow the shared account form field to be optional during onboarding. |
| `web/src/pages/Profile.jsx` | Edit the account name and avatar and use schedule-aware lifetime statistics. |
| `web/src/pages/Settings.jsx` | Show operation failures and improve palette layout on small screens. |
| `web/src/pages/Signup.jsx` | Validate password length and persist optional personalization alongside registration. |
| `tests/stage2.test.cjs` | Verify migration, session and account isolation, API mutations, and reporting calculations. |
| `tests/stage2-browser.cjs` | Exercise the browser flows against a temporary API and database. |
| `README.md`, `web/README.md`, `android/README.md`, `data/README.md` | Document installation, persistence, verification, the Android storage boundary and the migration checkpoint. |
| `shared/documentation/data-model.md` | Document session, historical schedule, point and relationship semantics. |
| `STAGE2-AUDIT.md` | Record feature status and defects before implementation. |
| `data/habit_tracker.db.before-stage2-core.bak` | Verified SQLite checkpoint from before the migration. |
