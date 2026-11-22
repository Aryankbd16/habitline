# Habitline Phase 4

Phase 4 adds a Progress hub with XP, achievements, personal challenges, friends, private groups, shared challenges, rankings and friend activity. It continues to use the Express API, SQLite and revocable account sessions. Social interactions work between accounts that can reach the same local backend.

## XP and awards

- A habit earns 10 XP by default. Set a reward of 0–100 whole XP when creating or editing the habit. Habit points and saved completion points retain their prior meaning.
- Marking a scheduled habit creates a completion and a unique positive XP event in the same transaction. Undo and permanent deletion reverse precisely that award. Re-marking the same habit and local date reuses the original XP value, even if the reward setting changed. Existing and imported completions never generate retroactive XP. Account balance is the signed ledger sum.
- Level 1 starts at zero XP. Level L begins at `step × L × (L−1) ÷ 2`. The configured step defaults to 100, so levels 2, 3 and 4 begin at 100, 300 and 600 XP. Set `HABITLINE_XP_LEVEL_STEP` before startup to configure the curve. Changing it recalculates current levels while preserving earned snapshots.
- The Phase 3 milestone table stores level milestones, 1/7/100/500 tracked completion badges, challenge completions, group participation, and 3/7/14/30/100 scheduled-occurrence streak milestones. Phase 3 already supplies the 7-occurrence streak award. Tracked completion counts exclude imports. Streaks reuse persisted schedule history and can include earlier completion records. Existing milestones remain readable. Undo may lower the current level or challenge progress while earned snapshots remain visible. Newly earned completion awards appear in an accessible status banner.

## Challenges

Challenges have inclusive start and end dates, a target, a completion-count or streak measure, and selectable habit links. Count mode sums eligible unique habit/day rows. Streak mode links one habit and uses its schedule history. Archives stop progress after the archive date. Restoring reopens the original date window. Personal challenges include existing persisted data and remain separate from goals.

Shared challenges require an invitation and explicit acceptance with the participant's own habit links. The creator can set an individual target when inviting a participant. Group challenges can be created by owners or administrators. Shared progress begins at the later of the challenge's start or the participant's join date, and excludes imported completion rows. The score is recomputed server-side. A shared challenge exposes a participant's identity, score and completion status inside that challenge. Other participants' linked habits stay private. The existing tracker records self-reported completions.

## Privacy and rankings

Social profiles are optional. Defaults are hidden from search, private details, XP off, and achievements off. Discovery uses username prefixes and returns limited identity for discoverable profiles. Friend and public visibility are scoped to signed-in accounts. Social responses omit email, password hashes, session identifiers and private habit or goal data. Groups are invitation-only and private. Group owner and administrator actions have separate permissions.

Blocking removes the direct contact, pending invitations between the pair, and direct reactions. Shared group membership can continue, with blocked peer identities, rankings and direct interactions filtered. Social writes and discovery share an account-level limit of 60 requests per minute. The in-memory throttle is process-local and resets on restart.

Friends and group rankings use net in-app XP earned in the selected week or month, with a cap of 100 XP per local date. Monday starts the week. Other people appear only if their XP settings allow visibility to the viewer. Challenge rankings use eligible completion or streak totals. Equal scores share a dense rank, with username ordering inside ties.

Friends activity requires intentional publication of an earned award. Feed captions omit private titles. Each eligible friend can set or clear one reaction per post. Cards are generated in the browser as PNGs. The browser shares the file natively when supported and offers a download otherwise. The card contains the award title shown before sharing.

## API

All routes require the existing session. Mutations also require the existing request header.

| Route | Methods and behavior |
| --- | --- |
| `/api/game` | GET XP, level, personal records, recent activity, earned milestones |
| `/api/social/profile` | GET or PUT own social profile |
| `/api/social/search?username=...` | GET discoverable accounts |
| `/api/social/profiles/:id` | GET privacy-filtered profile |
| `/api/social/friends` | GET contacts and blocks |
| `/api/social/friends/:id` | POST request, PATCH accept/reject, DELETE cancel or remove |
| `/api/social/blocks/:id` | PUT block or DELETE unblock |
| `/api/social/groups` | GET memberships and invitations, POST create |
| `/api/social/groups/:id` | GET private detail, PATCH update, DELETE owner removal |
| `/api/social/groups/:id/invite/:other` | POST invitation |
| `/api/social/groups/:id/invitation` | PATCH accept or decline |
| `/api/social/groups/:id/members/:other` | PATCH role, DELETE remove or leave |
| `/api/social/challenges` | GET available challenges, POST create |
| `/api/social/challenges/:id` | PATCH owner edit, archive or restore |
| `/api/social/challenges/:id/invite/:other` | POST invitation |
| `/api/social/challenges/:id/join` | PATCH accept with owned links or decline |
| `/api/social/challenges/:id/habits` | PUT own links |
| `/api/social/challenges/:id/participation` | DELETE own participation |
| `/api/social/leaderboard` | GET friends or authorized group period rankings |
| `/api/social/feed` | GET friend activity, POST own earned award |
| `/api/social/feed/:id` | DELETE own post |
| `/api/social/feed/:id/reaction` | PUT selected reaction or null to clear |

## Migration and changed files

The additive startup migration adds `habits.xp_value`, `xp_events`, `social_profiles`, `contacts`, `social_blocks`, `accountability_groups`, `group_members`, `social_posts`, `social_reactions`, `challenges`, `challenge_members` and `challenge_habits`. Existing milestones are reused. The XP ledger retains habit and completion IDs as audit snapshots after deletion and keeps the account foreign key. The pre-change backup is `data/habit_tracker.db.before-phase4.bak`.

- `server/index.cjs` integrates startup and transactional completion hooks.
- `server/game.cjs`, `server/social.cjs`, and `server/challenges.cjs` hold feature schema, validation and routes.
- `web/src/pages/ProgressHub.jsx`, `web/src/components/{ProgressUI,ChallengePanel,CommunityPanel}.jsx` and `web/src/lib/{community,shareAward}.js` implement the hub and sharing.
- `web/src/{App.jsx,pages/Dashboard.jsx,components/AppShell.jsx,components/AddHabitModal.jsx,context/HabitsContext.jsx}` connect navigation, completion awards and XP settings.
- `tests/phase4.test.cjs`, `tests/phase3.test.cjs` and `tests/stage2-browser.cjs` cover the new workflows and regressions.

## Android and operating limits

The Kotlin widget still writes a habit ID and local-date completion to its independent SharedPreferences store. That data shape is compatible with a future authenticated completion bridge. Widget taps currently remain local to Android and do not create web XP, challenges or awards. Android needs an authenticated API client, schedule revisions, award and ledger models, offline reconciliation, and UI before it can support those features. No Kotlin or widget code changed. The Android SDK, Gradle and wrapper scripts were unavailable for verification.

The active local database was left unmigrated during development. On the next intentional backend restart from this checkout, startup applies Phase 4 to that database. Use SQLite backup for complete recovery. JSON backup still covers the existing habit, completion and relationship records. Hosting, cross-device sync, remote moderation and centralized throttling belong to a later phase.
