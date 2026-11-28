const { mkdirSync, closeSync, openSync } = require('node:fs')
const { join } = require('node:path')
const Database = require('better-sqlite3')
const express = require('express')
const installProgress = require('../../server/progress.cjs')

const directory = process.argv[2]
if (!directory) throw new Error('Pass a directory for the generated test fixtures')
mkdirSync(directory, { recursive: true })

function writeFixture(filename, beforePhase4) {
  const path = join(directory, filename)
  closeSync(openSync(path, 'wx'))
  const db = new Database(path, { fileMustExist: true })
  try {
    db.pragma('foreign_keys = ON')
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, avatar_emoji TEXT, onboarding TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE habits (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL,
        description TEXT NOT NULL, category TEXT NOT NULL, icon TEXT, type TEXT NOT NULL,
        frequency TEXT NOT NULL, start_date TEXT NOT NULL, points REAL NOT NULL,
        priority TEXT NOT NULL, reminder_time TEXT, is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE completions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        habit_id TEXT NOT NULL REFERENCES habits(id), date TEXT NOT NULL, completed_at TEXT NOT NULL,
        UNIQUE(habit_id, date)
      );
      INSERT INTO users VALUES ('fixture-user', 'Fixture User', 'legacy@example.invalid',
        'fixture-no-password', NULL, '{}', '2026-01-01T00:00:00Z');
      INSERT INTO habits VALUES
        ('reading', 'fixture-user', 'Read', '', 'Learning', NULL, 'build',
          '{"type":"daily"}', '2026-01-01', 15, 'medium', NULL, 0, '2026-01-01T00:00:00Z'),
        ('walking', 'fixture-user', 'Walk', '', 'Health', NULL, 'build',
          '{"type":"daily"}', '2026-01-01', 10, 'medium', NULL, 0, '2026-01-01T00:00:00Z');
      INSERT INTO completions VALUES
        ('fixture-completion', 'fixture-user', 'reading', '2026-01-02', '2026-01-02T00:00:00Z');
    `)
    if (beforePhase4) {
      db.exec(`
        ALTER TABLE habits ADD COLUMN schedule_history TEXT NOT NULL DEFAULT '[]';
        ALTER TABLE completions ADD COLUMN points_earned REAL;
        UPDATE completions SET points_earned = 15;
        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
        );
        CREATE TABLE habit_relationships (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
          habit_id TEXT NOT NULL REFERENCES habits(id), related_habit_id TEXT NOT NULL REFERENCES habits(id),
          relationship_type TEXT NOT NULL DEFAULT 'Related', created_at TEXT NOT NULL,
          UNIQUE(user_id, habit_id, related_habit_id)
        );
        CREATE TABLE settings (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), key TEXT NOT NULL,
          value TEXT NOT NULL, UNIQUE(user_id, key)
        );
        INSERT INTO sessions VALUES ('fixture-no-token', 'fixture-user', 4102444800000);
        INSERT INTO habit_relationships VALUES
          ('fixture-pair', 'fixture-user', 'reading', 'walking', 'Related', '2026-01-02T00:00:00Z');
        INSERT INTO settings VALUES ('fixture-setting', 'fixture-user', 'example', 'true');
      `)
      installProgress({ app: express(), db, requireUser: () => {} })
      db.exec(`
        INSERT INTO goals VALUES
          ('fixture-goal', 'fixture-user', 'Read once', '', 1, '2026-01-01', NULL, NULL, '2026-01-01T00:00:00Z');
        INSERT INTO goal_habits VALUES ('fixture-goal', 'reading');
        INSERT INTO milestones VALUES
          ('fixture-user', 'goal-target', 'fixture-goal', 'Read once', 'Reached goal', '2026-01-02');
      `)
    }
  } finally {
    db.close()
  }
}

writeFixture('legacy.db', false)
writeFixture('before-phase4.db', true)
