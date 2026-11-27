# Habitline Phase 5 plan

**Current implementation brief.** The Android APK milestone includes paired LAN sync and bidirectional file transfer. Hosted Android builds replace the earlier local Studio provisioning proposal. The [current audit and acceptance plan](PHASE5-AUDIT.md) governs the A–G sequence. The original design notes below preserve the earlier investigation and parity rules.

## Current Android implementation

| Area | Verified in source | Gaps and risks |
| --- | --- | --- |
| App and build | Native Kotlin AppCompat activity with ViewBinding, RecyclerView and Material dialogs. Package and namespace are `com.habitline`. AGP 8.5.2, Kotlin 1.9.24, compile and target API 34, minimum API 26. | No Gradle wrapper scripts or JAR. The wrapper properties reference Gradle 8.7. No APK, unit tests, or instrumentation tests were found in the Android module. |
| Local persistence | `HabitRepository.kt` stores one Gson JSON blob under `habitline_store/habitline_store_json`. It contains UUID habits, habit/date completions, and widget-to-habit bindings. | There is no SQLite database, local profile, migration history, error distinction between corrupt and empty data, or transactional protection across app and widget reads and writes. |
| Habit management | Create, remove, mark and undo are present. The model stores an icon, integer points, creation timestamp, and weekday fields. | Weekly fields are not applied to the prototype completion or streak logic. Streaks count consecutive calendar days. Editing, archive/restore, categories, difficulty, detail and calendar are absent. |
| Widget | The launcher-configured RemoteViews provider reads the same repository and shows a check state, streak and 10-day strip. The receiver refreshes the tapped instance. | The configuration activity is non-exported even though the launcher is an external caller. Device behavior is unverified. The receiver does not validate the widget binding, current schedule or requested mark state. App writes do not proactively refresh other bound instances. Rendering issues several reads of the JSON blob. |
| Profile, theme and reminders | Existing Material DayNight base theme and amber accent can be reused for the design. Manifest declares no permissions. | No persisted profile/theme settings or native reminder scheduler. Actual appearance on device is unverified. |
| Goals, analytics and gamification | The web API and its shared rules provide reference behavior. | The Kotlin prototype has no goals, progress views, milestone/XP ledger, challenges or social client. |

The audit read all six Kotlin files, the manifest, app widget configuration, Gradle files, Android README, shared data-model reference, and the Phase 2–4 API and calculation entry points. PowerShell parsed all 18 Android XML files successfully. XML parsing does not validate Android resource references, packaging or runtime behavior.

## Checkpoint A prerequisites

**Observed on this checkout.** Temurin JDK 17 and WinGet are available. Gradle, `adb`, `emulator`, `sdkmanager`, Android Studio and SDK directories at the inspected locations, and all three executable wrapper files are absent. The existing properties already point to Gradle 8.7. The Stage 1 gated build invocation exited 1 before Gradle ran. No baseline APK or device result exists. `git rev-parse --is-inside-work-tree` and `git status --short` both reported that the checkout has no Git metadata.

### Reproduce the unmodified Android build

1. Install Android Studio from the official distribution. Use SDK Manager to install SDK Platform 34, Build Tools 34.0.0 and Platform Tools. Install the Android Emulator and a test system image if using an emulator. Configure the SDK path for this machine and use JDK 17 as the Gradle JDK.
2. Obtain the official Gradle 8.7 binary distribution, compare its SHA-256 with the published value before running it, and generate the wrapper from `android/`.
3. Retain both scripts, the wrapper JAR, and properties. Verify the JAR against the official wrapper checksum and pin the official binary SHA-256 in `distributionSha256Sum`. Confirm that plugin and dependency repositories match `settings.gradle.kts` and inspect the resolved runtime dependency graph. Keep machine-specific SDK paths outside version control.
4. Run the unmodified prototype `:app:assembleDebug` before editing app or widget sources. Capture the exact commands, tool versions, exit codes, dependency failures or warnings, and actual APK output if produced. Treat APK installation and device behavior as separate checks.

Planned Windows commands from `android/`, after provisioning and checksum verification:

```powershell
java -version
gradle wrapper --gradle-version 8.7 --distribution-type bin
.\gradlew.bat --version
.\gradlew.bat :app:dependencies --configuration debugRuntimeClasspath
.\gradlew.bat :app:assembleDebug
adb devices
```

### Establish a rollback checkpoint

- Inventory the checkout, including hidden files, Android and widget sources, web and server code, tests, lockfiles, documentation, generated files and existing backups. Use a new, uniquely named backup destination outside the source tree. Refuse a naming collision.
- If Git initialization is feasible in this workspace, initialize locally, review exclusions and stage the source baseline. Keep databases, database backups and secrets outside Git history. The Git commit is a source checkpoint. The complete backup below still protects data and anything outside Git. No remote is required.
- With no Git metadata today, the default is a complete independent project copy. Capture the active laptop SQLite database with SQLite's online backup API from a read-only source connection. Treat the resulting consistent snapshot as the database in the project copy. Copy the other project files and prior backups without replacing them or using loose copies of the active database and its WAL/SHM as the recovery database.
- Verify the copy against a relative-path and SHA-256 inventory for ordinary files. Open copied databases read-only and check SQLite integrity and foreign keys on the active snapshot. Record the destination, timestamp, manifest, and recovery procedure. Keep recovery separate from the working checkout until a deliberate restore is authorized. No web schema or live database writes are part of Checkpoint A.

References: [AGP 8.5 build compatibility](https://developer.android.com/build/releases/agp-8-5-0-release-notes), [Gradle distribution and wrapper checksums](https://gradle.org/release-checksums/), [Compose and Kotlin compatibility](https://developer.android.com/jetpack/androidx/releases/compose-kotlin), [widget configuration lifecycle](https://developer.android.com/develop/ui/compose/glance/configuration).

## Architecture decision

Keep the existing app module, package ID, launcher entry point and RemoteViews widget. Build new native screens with Compose and Material where tooling resolves successfully. Kotlin 1.9.24 has a compatible Compose compiler version, so this does not require an immediate Kotlin/AGP upgrade. Keep widget resources and launcher integration independent from screen rendering. If dependency resolution prevents Compose on the existing baseline, source changes should first resolve the concrete tooling requirement and record the tradeoff.

Use Room backed by app-private SQLite, repository methods shared by the UI, widget and reminder entry points, and lifecycle-aware ViewModels with coroutines and Flow. Use a testable clock and device time zone for date-based rules. Create and update tracker data locally without needing an API, a laptop session, a network permission, or a runtime WebView. Keep device-local presentation and widget settings separate from future account synchronization.

## Planned SQLite mapping

| Android records | Laptop mapping and invariants |
| --- | --- |
| Local profile and appearance | Device-local UUID, display name and preferences. Future pairing can map that profile to a server user ID. Password hashes and sessions are outside this model. |
| Habit and schedule revisions | Preserve habit UUID. Match names, description/category, icon, priority, optional reminder, start date and archive status, fractional points and separate integer XP. Revisions map to web effective-date history. Weekday numbering stays Sunday 0 through Saturday 6. |
| Completion and XP transaction | Unique active habit UUID and local date, stable completion UUID and time stamps, saved points and per-occurrence XP snapshot. Award, undo and reversal run in one database transaction. Legacy records contribute historical tracking without retroactive XP. |
| Goal and goal-habit links | Goal UUID, target and inclusive date window, archive state, and unique links. Progress counts each qualifying completion once. |
| Personal challenge and links | Challenge UUID, date window, completion or schedule-streak target, archive state and owned habit links. Store the personal scope locally. |
| Milestone | Immutable title/description and earned-date snapshot, unique by profile, award type and subject. Share the Phase 4 criteria for levels, streaks and tracked completions. |
| Widget bindings and reminder preferences | Local widget instance ID or scheduling metadata tied to a habit UUID. These device-specific records stay on the phone. |
| Change metadata | Record UUID, owner, created and updated UTC instants, nullable deletion instant and local mutation ID. Reserve an outbox boundary for transactional local change tracking and future cursor handling. |

Preserve the installed app and:

1. Read the old blob without altering it. Validate its structure and separately report malformed data.
2. Import valid habits, completions and widget bindings together with a migration marker in one Room transaction. Preserve old UUIDs and local-date keys. Use repeatable completion IDs derived from the legacy habit/date key for legacy imports. Deduplicate exact repeats and surface orphaned or malformed entries.
3. Preserve the original preferences until the migration succeeds and reconciles counts. Keep them available for recovery. Exercise process interruption and retry. Do not use a destructive Room fallback.
4. Make both widget and foreground UI read and write Room. Refresh all widgets bound to a habit after a committed edit or completion. Validate launcher widget ID and the stored binding, and apply explicit desired completion state. Check launcher configuration on a real Android host before changing export scope.

## Mandatory web/API rule parity

Use versioned, synthetic test vectors shared between the Node and Kotlin suites. Pin the time zone, clock and input rows. Generate or verify expected outputs using the existing Phase 2–4 implementations, then run the same inputs in Kotlin. Fixtures will exercise these contracts:

- Sunday-zero weekly schedules, inclusive local start date, effective-date schedule revisions, same-day edits, historical archive ranges and retained completions.
- Current and longest schedule-aware streaks, pending work today, unscheduled gaps, missed scheduled days and archived habits.
- Goal start and target dates, archive cutoff, linked-habit deduplication and progress after undo. Include weekly and monthly analytics and exact insight thresholds.
- Idempotent XP awards, saved points separate from XP, exact reversal on undo, stable reward for a same-day re-mark, and the Phase 4 rule for historical imports.
- Immutable milestone snapshots, uniqueness by profile, type and subject, and retained earned awards after undo or deletion.
- Local date keys, UTC event instants, Sunday/Monday and month/year boundaries, daylight-saving transitions and time-zone changes. Verify widget and foreground code use the same rules.

A divergence blocks the relevant checkpoint until the Android implementation and fixtures agree with the web behavior. Any intentional cross-platform rule change requires an explicit spec decision. Android uses its local database and does not call the web API for these calculations.

## Local backup and restore

Offer **Export backup** and **Restore backup** in Settings via Android's Storage Access Framework. Use a versioned archive with a manifest, checksums and explicit schema/version metadata. Export a consistent Room snapshot covering habits, schedule revisions, completions, history, goals and links, habit relationships, XP ledger, milestones, personal challenges and links, local profile, and relevant theme and reminder preferences. Exclude sync credentials and launcher widget instance IDs. After restore, reconcile reminders and let the user rebind widgets where needed.

Parse and stage the import before any write. Check version, sizes, checksums, schema, IDs, uniqueness, owners, dates, links and ledger consistency. Explain the restore behavior and show record counts before asking for confirmation. Create a recoverable on-device snapshot before replacement. Apply the restore in one transaction, verify counts and integrity, and leave existing data intact if validation or the transaction fails. Treat unsupported versions and malformed archives as errors. Show the actual outcome and offer a way to recover from the pre-restore snapshot. Test round trips, damaged and newer backups, wrong-profile data, duplicate IDs, and interruption during restore with the laptop off.

## Implementation checkpoints

| Checkpoint | Scope | Exit evidence |
| --- | --- | --- |
| A. Build environment and rollback baseline | Provision Studio and SDK, generate and verify the wrapper, establish a verified rollback copy and run the existing source baseline. | Tool versions, checksum verification, source and data recovery manifest, and an actual unmodified APK build or a documented blocker. Checkpoint B starts after the rollback copy is verified and the baseline build succeeds. |
| B. Room database, legacy migration and widget integration | Add versioned Room schema and migrate SharedPreferences safely. Route app and widget storage through the same repository. | Clean-install and seeded upgrade tests, preserved IDs and history, repeatable import, database integrity and widget integration checks. |
| C. Native habit tracker, dashboard and calendar | Add onboarding, profile and appearance, creation and editing, archive and restore, completion and undo, history and navigation. | Parity for schedules and streaks, local persistence after relaunch, and working calendar in airplane mode. |
| D. Goals, analytics and insights | Add goal links, summaries and evidence-based insights. | Shared goal, period, archive and insight fixtures pass in Node and Kotlin. |
| E. Gamification and personal challenges | Add transactional XP and reversals, levels, award history and challenge progress. | Shared gamification fixtures pass. Repeated writes and replay preserve XP and milestone uniqueness. |
| F. Notifications and widget reliability | Verify launcher configuration, shared widget state, reminders, permission denial and rescheduling. | Real device or emulator evidence, including multiple widgets, restart and documented force-stop behavior. |
| G. Local backup/restore, regression testing and APK generation | Implement the local backup flow, run Android and web regressions, build the debug APK and document installation and release signing configuration. | Offline backup/restore round trip and negative tests, exact test results, real APK path after successful packaging, installation evidence where supported, and preservation of the laptop database. |

Friends, groups, shared challenges and live leaderboards remain backend-dependent. Phase 5 adds no simulated social activity or network synchronization.

## Phase 6 LAN synchronization proposal

Phase 6 adds explicit account pairing to a specific laptop and preserves independent Room and server SQLite databases. Use an authenticated, versioned LAN API with an explicit secure transport and pairing trust model. WorkManager schedules retryable background attempts when the configured laptop becomes reachable. **Sync Now** submits the same work and reports actual progress or failure. Neither path depends on cloud hosting.

Push bounded batches of owner-scoped mutations with stable mutation IDs and per-record base revisions. The server authorizes ownership, commits accepted changes transactionally, deduplicates mutation IDs, and assigns monotonic change sequence numbers. Pull changed records and tombstones after the last committed cursor. Apply and advance that cursor in the same Room transaction. Keep unacknowledged local operations available after a failure or force-stop.

Merge independent fields where safe. Treat simultaneous edits to the same document field or schedule boundary as conflicts with deterministic server revisions and a review path. Never silently resurrect tombstoned records. Reconcile completion mark/undo by habit/date with idempotent desired-state operations; reconcile ledger effects using the corresponding completion events rather than adding balances together. Keep widget IDs, device appearance, and reminder delivery state outside sync. Handle initially divergent local histories through an explicit pairing and merge flow. Phase 9 remains the first remote/cloud hosting phase.

## Acceptance and test matrix

- Run JVM parity fixtures against weekly schedules, schedule changes, archive history, time-zone and DST boundaries, saved points, goal date windows, insight thresholds, XP awards/reversals and milestone deduplication.
- Run Room and instrumentation tests on a clean install and a seeded legacy upgrade. Verify repeatable import, corruption recovery, database integrity, referential constraints, concurrent widget/app writes and preserved history.
- Run onboarding, habit editing, completion and undo, navigation, calendar, goals, analytics, XP, challenges, themes, notifications and widget configuration on a device. Test permission grant and denial, multiple widget instances, restart, force-stop and manual relaunch, airplane mode and laptop shutdown. Record platform limits on background delivery after force-stop.
- With a wrapper and SDK available, run `.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`; with a device attached, run `.\gradlew.bat :app:connectedDebugAndroidTest`. The expected debug output is `android/app/build/outputs/apk/debug/app-debug.apk`, and the installation command from checkout root is `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. These are planned commands and paths.
- Rerun the existing web/backend test and browser suites with disposable SQLite databases, plus the frontend production build and lint. Preserve the laptop schema and data during Phase 5.
- Record results in `PHASE5-AUDIT.md` and deliver implementation, APK, and setup status in `PHASE5-REPORT.md` after the approved work.
