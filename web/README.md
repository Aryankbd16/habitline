# Habitline Web

The web app uses React, Vite, Tailwind, React Router and Recharts. Express and SQLite store accounts, habits, completion logs and relationships. See the [root README](../README.md) for startup, build and deployment instructions.

`src/pages/` contains the dashboard, calendar, analytics, profile, account and settings screens. Context providers manage sessions, account data and theme. The web and SQLite API use a same-origin `/api` path. The development and preview proxy target can be set with `HABITLINE_API_TARGET`.

The PWA can be installed from a supported browser. Its service worker caches static assets and excludes the API. Account data requires a server connection. Legacy IndexedDB code is retained as a reference for older browser-local data.
