import Dexie from 'dexie'

/**
 * Habitline local-first database.
 *
 * Design notes for future phases:
 * - Every table has an `id` primary key that is a stable string (uuid), not an
 *   auto-increment int, so that records can later be merged with a cloud DB
 *   without collisions.
 * - `habits.type` is stored even though Phase 1 only implements 'binary'.
 *   This keeps the schema forward-compatible with quantity/duration/repetition/
 *   avoidance habit types without a migration.
 * - `completions` are append-only-ish records keyed by (habitId, date) so a
 *   habit can never be double-completed on the same day (enforced in
 *   lib/habitService.js, not here, so validation logic stays centralized).
 * - All monetary/points/streak MATH lives in lib/calculations.js, never here
 *   and never duplicated in components.
 */
export const db = new Dexie('habitline')

db.version(1).stores({
  // Local "auth" — see lib/auth.js for hashing. Single-user-per-browser-profile
  // in Phase 1, but keyed by id so multiple local accounts can coexist.
  users: 'id, email',

  // The currently active session (very small table, effectively a singleton)
  session: 'id',

  habits:
    'id, userId, name, category, frequency, isArchived, createdAt',

  completions:
    'id, [habitId+date], habitId, date, userId',

  // Free-form key/value app settings (theme, accent color, reminder prefs)
  settings: 'id, userId',
})

export default db
