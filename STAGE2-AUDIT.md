# Habitline Stage 2 baseline audit

| Area | Status before implementation | Findings |
| --- | --- | --- |
| Repository and build | Requires testing | React, Vite, Tailwind, Express 5 and better-sqlite3 are installed. No Git metadata or project test suite found. Deployment instructions still describe IndexedDB. |
| SQLite | Partially implemented | Existing database contains one account, three habits and one completion. Foreign-key integrity check found no violations. User settings table exists but themes use browser storage. |
| Authentication and profile | Broken or inconsistent | Passwords use bcrypt, but the browser stores a public user ID as its session and the API trusts caller-supplied IDs. Profile saves avatar and onboarding, with no name editing. |
| Habits | Partially implemented | Create, edit, archive and delete routes exist. Editing is reachable from today's cards or archive management. API updates lack validation and the category list is fixed. |
| Daily tracking | Broken or inconsistent | SQLite has a unique habit/day constraint, but a repeated toggle reverses the previous write. Completion accepts arbitrary dates. Today can become stale in an open tab. |
| Calendar and statistics | Broken or inconsistent | Calendar navigation and persisted reads exist. Future dates can appear missed and archived habits disappear from history. Profile rate counts habits ever completed instead of scheduled days. Points use current weights. |
| Dashboard personalization | Partially implemented | Onboarding stores role, goals and focus, then groups matching habits. Unmatched categories collapse into Other. |
| Relationships | Requires testing | Existing scoped association routes, canonical pair ordering and modal. Removal and stale references need handling. No dependency behavior. |
| Themes | Requires testing | Light, dark, system and accent persist in browser storage. Some accent foregrounds need contrast review. |
| Backup and restore | Broken or inconsistent | Import uses unrestricted replacement by ID. Export omits relationships. |
| PWA and offline | Partially implemented | Installable shell and service worker exist. The active data path needs SQLite over HTTP. Dexie and local crypto code are legacy paths and the offline claims are stale. |
| Android and widget | Requires testing | Kotlin companion and widget share an on-device SharedPreferences repository. They do not use web account or SQLite APIs. Wrapper scripts and installed Gradle were absent at inspection. |
| Shared code and docs | Partially implemented | Logical model is documented. Android and web have separate implementations. |
