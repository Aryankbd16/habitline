# Habitline data directory

When the local API starts, it creates `habit_tracker.db` here unless the
`DATABASE_PATH` environment variable specifies another path. This SQLite file
contains the persistent users, habits, completions, relationships, settings and sessions.

To back up the local database while the API is stopped, copy `habit_tracker.db`.
You can also use Settings → Export in the app for a portable JSON backup.

The verified pre-Stage 2 SQLite backup is `habit_tracker.db.before-stage2-core.bak`.
