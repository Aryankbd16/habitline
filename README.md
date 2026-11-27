# Habitline

Habitline has a React and Vite web app backed by a local Express and SQLite API. The Kotlin Android companion and home-screen widget store their own habits on-device. See the [Stage 2 baseline audit](STAGE2-AUDIT.md) for the status before implementation.

## Run the web app

Use Node.js 22. Install dependencies in both directories, then start the API and web app in separate terminals.

```sh
# Repository root
npm install
npm run server
```

```sh
cd web
npm install
npm run dev
```

Open the HTTPS URL Vite prints. The development HTTPS certificate is self-signed. Vite proxies `/api` to the Express server on loopback. A phone on the same Wi-Fi can use Vite's network URL when the host firewall permits it. The API stores records in `data/habit_tracker.db` by default. Set `DATABASE_PATH` to use a different SQLite file.

For a production build and local preview, run `npm run build` and `npm run preview` from `web/` while the API is running. For deployment, serve the static build and proxy `/api` on the same HTTPS origin, run Express with `NODE_ENV=production`, and keep SQLite on a persistent volume. Add public-facing authentication rate limits at the proxy before exposing the service to the internet.

Existing users sign in once using their existing password. Session cookies expire after 30 days. Browser theme preferences persist on the current browser profile. The PWA caches the app shell, and sign-in and habit reads and writes require access to the API.

## Tracking and backups

- Create daily or selected-weekday habits. Use any category and pick a priority to order habits within their dashboard sections.
- Edit habits on the dashboard, including future, unscheduled and archived habits. Archive pauses scheduling and keeps completion records. Settings also supports restoration and explicitly confirmed permanent deletion.
- Calendar, analytics and profile use the same day-level progress calculations. The 7-day and 30-day comparisons are rolling windows. Streaks count consecutive scheduled days.
- Settings exports habits, completions and relationships. Import merges records and keeps existing habits and completions. Theme and credentials remain specific to the current installation.
- Before this migration, the SQLite backup was saved as `data/habit_tracker.db.before-stage2-core.bak`. The API applies additive schema updates on startup. See the [shared data model](shared/documentation/data-model.md) for historical limits.

## Verification

From the repository root, `node --test tests/stage2.test.cjs` runs the API and calculation tests against a temporary database. On Windows, `node tests/stage2-browser.cjs` runs the headless Edge smoke test. Set `EDGE_EXE` if Edge is installed outside the default location. Both tests need localhost networking. From `web/`, run `npm run build` and `npm run lint`.

## Android and synchronization

The Android project builds on a GitHub-hosted Linux runner. See the [Android build and widget guide](android/README.md) for artifacts, signing and installation, and the [APK milestone audit](PHASE5-AUDIT.md) for parity and acceptance criteria.

The verified prototype APK uses SharedPreferences. The subsequent storage checkpoint moves the app and widget to Room and preserves the original JSON during migration. See the [build and test record](PHASE5-REPORT.md) for the version each result covers. Pairing and cross-device reconciliation are pending.

## Phase 3 progress intelligence

Open Analytics for week, month, lifetime, and individual habit reports. Use Goals to track completion targets and Profile to order focus categories and view earned milestones. See the [Phase 3 report](PHASE3-REPORT.md) for formulas, API routes, and the database checkpoint.

Run the Phase 2 and Phase 3 Node suites together with `node --test tests/stage2.test.cjs tests/phase3.test.cjs`. The browser smoke test also exercises Phase 3 routes.

## Phase 4 gamification and local social features

Open **Progress and challenges** from the dashboard to see XP, personal challenges, people, groups, rankings, and activity. Social profiles and sharing are opt-in. All accounts use the same local API and SQLite database. Phase 4 adds its schema when the API restarts. See [Phase 4 rules and API](PHASE4-REPORT.md).

From the root, run `node --test tests/stage2.test.cjs tests/phase3.test.cjs tests/phase4.test.cjs` and `node tests/stage2-browser.cjs` for local verification. The Phase 4 suite copies the pre-change backup. Run the production build and lint from `web/`.
