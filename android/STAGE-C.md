# Habitline Android Stage C

## Baseline

Work began on `habitline_checkpointBranch` at `89cff3a514d2215a4fc61c7662f3d59073d9924d` with a clean tree. The baseline's successful Android workflow covered the original offline smoke test, legacy upgrade, Room instrumentation, Kotlin tests and lint. [Baseline workflow run](https://github.com/Aryankbd16/habitline/actions/runs/45989591071).

The Stage C app version is `1.2-offline`, code `3`, with package `com.habitline`, minimum API 26 and target API 34. The Android app uses its own Room database. Core actions start from native Android views and run locally without account setup.

## Implementation checkpoints

| Checkpoint | Delivered | Local verification |
| --- | --- | --- |
| C1 | Jetpack ViewModel, observable Room state, native navigation, recovery states and the Today dashboard | Kotlin source and shared progress rules |
| C2 | Habit details, creation and editing, built-in and custom categories, start date, schedule, points, priority, icon, archive, restore, deletion and contextual relationships | JVM validation and schedule cases. Room instrumentation is configured in CI. |
| C3 | Monday-start calendar, daily history, monthly navigation, profile name, profession and appearance | JVM calendar, historical schedule and streak cases. Profile persistence is covered by the staged Room and emulator checks. |
| C4 | Material layouts and theme palettes, accessibility labels, a native offline smoke test and hosted diagnostics | Kotlin source, Android resource compilation, Node, Edge and the web production build. Hosted Android checks remain pending push approval. |

## Screens and behavior

- **Today** shows a device-local greeting and date, completion counts and percentage, scheduled habits with mark and undo, the last seven days, the best current streak and the latest recorded completion. When there are no scheduled opportunities, it displays an empty state and omits the percentage.
- **Habits** has separate active and archived lists. **Habit details** shows category, priority, schedule, start date, points and recent completion dates. It supports edit, archive, restore, permanent deletion with confirmation, and the Related, Supports and Paired connections. Connections are contextual and completion remains independent.
- **New habit** and **Edit habit** support daily or weekday schedules, category suggestions and custom text, validation, fractional points, and rotation-safe drafts. Custom categories remain available in suggestions while habits use them. Creation uses a stable draft ID so a repeated save cannot insert a second record. Different habits may share a name, as on the web.
- **Calendar** shows completed, partially completed and scheduled days. It supports previous and next months, returning to today and inspecting each date. A same-day archive or schedule edit can remove an opportunity from totals while the recorded mark remains visible in history. Today's mark can still be undone there. Future dates show scheduled work and are excluded from completion totals.
- **Profile** stores name, profession, and system, light or dark appearance in Room. It shows the installed version and explains local storage. **Storage recovery** offers retry and export of the original legacy JSON when available. The widget shares the transaction layer and retains its binding when a habit is archived.

## Room and schedule rules

Room stays on schema version 1. The entities, database version, exported schema and SharedPreferences migration are the same as the verified checkpoint. New DAO operations use the existing habit, schedule, profile, preference and relationship tables. Transactions commit habit and schedule changes together with outbox entries. Completion keeps the existing unique habit/date constraint and the transactional award/reversal ledger. Permanent deletion removes completion and schedule records and preserves the deletion markers and ledger reversals.

Schedule, start date, points and archive changes take effect on the local date of the edit. Multiple changes on one local date update that date's revision. Earlier revisions and the points snapshot on each completion remain available for history. Today's completion requires an eligible occurrence. Undo requires an existing mark on the current local date and is safe to repeat. The calendar and dashboard use the same opportunity calculation.

The activity renders XML screens from a lifecycle-aware ViewModel. Room provides committed snapshots for the app and widget. The ViewModel retains navigation, date selection and form drafts in saved state. The activity refreshes date and greeting on foreground entry and device time broadcasts. Night mode is applied from the persisted profile.

## Verification

| Check | Stage C result |
| --- | --- |
| Kotlin JVM | **7 passed** using Kotlin 1.9.24 and JUnit 4.13.2 directly. Includes both baseline tests and five Stage C tests. |
| Android source and resources | 18 app and instrumentation Kotlin files type-checked with API 34, pinned library binaries and temporary XML-derived binding types. Android resources compiled with AAPT2. All 24 DAO queries prepared successfully against the pinned schema in SQLite. These checks do not exercise Gradle view binding generation or app startup. |
| Workflow scripts | `actionlint` 1.7.7, Bash syntax and Python syntax passed. |
| Room instrumentation and legacy migration | The four baseline instrumentation tests remain intact. Three new tests cover persisted CRUD and archive history, Room Flow progress and local date rollover, and unique relationship transactions. Hosted execution is pending. |
| Emulator | The workflow stages an offline prototype-to-Stage C upgrade and a separate clean install. The native smoke test exercises blank-name validation, rotation, a selected weekday schedule, mark and undo, progress, month navigation, history after archive, process restart, editing, restore, confirmed deletion and profile persistence. Hosted execution is pending. |
| Android lint | Configured as a hosted check. No Stage C Android lint result yet. |
| Web and backend | **8 Node tests passed**, including the existing Phase 2–4 suites and shared schedule fixture. **Headless Edge passed** and the **web production build passed** with the existing large-chunk warning. The regression suites used disposable SQLite databases. |
| GitHub Actions APK | Stage C run URL, downloadable APK, exact file size and digest are pending. The configured artifact is `habitline-1.2-offline-debug-<run>-<attempt>`. [Android APK workflow](https://github.com/Aryankbd16/habitline/actions/workflows/android-apk.yml). |

## Files

| Area | Files |
| --- | --- |
| Storage and domain | `HabitInput.kt`, `HabitRepository.kt`, `TrackerDao.kt`, `TrackerSnapshot.kt` |
| Native UI and widget | `MainActivity.kt`, `MainViewModel.kt`, `CoreForms.kt`, `TrackerScreens.kt`, `WidgetConfigActivity.kt`, `HabitWidgetProvider.kt` |
| Layouts | `activity_main.xml`, `activity_widget_config.xml`, `item_habit.xml`, `screen_calendar.xml`, `screen_dashboard.xml`, `screen_detail.xml`, `screen_editor.xml`, `screen_habits.xml`, `screen_profile.xml`, `screen_storage.xml` |
| Other resources | `core_navigation.xml`, `nav_tint.xml`, `ic_back.xml`, `ic_calendar.xml`, `ic_core_done.xml`, `ic_core_pending.xml`, `ic_habits.xml`, `ic_profile.xml`, `ic_today.xml`, `values/colors.xml`, `values-night/colors.xml`, `ids.xml`, `strings.xml`, `themes.xml` |
| Removed resources | `dialog_add_habit.xml`, `bg_card.xml`, `bg_check_button.xml` |
| Tests and packaging | `TrackerProgressTest.kt`, `CoreRepositoryTest.kt`, `stage_c_smoke.py`, `emulator-smoke.sh`, Android app Gradle config and `.github/workflows/android-apk.yml` |
| Documentation | `android/README.md`, `android/STAGE-C.md`, `PHASE5-REPORT.md` |

## Acceptance and later stages

Stage C still needs the workflow to assemble the APK, run Android lint and the Room tests, and install and exercise that APK in the hosted emulator. Physical-device operation, launcher widget behavior and API 26 runtime coverage still need device validation. Hosted debug keys are disposable, so an in-place update on a phone requires the certificate that signed its existing installation.

- **Stage D** covers analytics, insights, goals, XP and levels, milestones, challenges and social feature parity.
- **Stage E** covers backup/import, reminder delivery and expanded Android widget testing.
- **Stage F** covers authenticated local Wi-Fi pairing and synchronization.
- **Stage G** covers production signing, distribution and full device validation.

After push approval, run the workflow for the local Stage C checkpoint, review the job results and record the APK details from the run summary.
