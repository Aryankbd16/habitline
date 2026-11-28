# Habitline Stage E report

Stage E passed the hosted Android job on API 26 and 34, all 11 hosted web/backend tests, and the hosted production web build. The hosted Edge browser regression is the remaining verification gate.

## Baseline and build

Work started on `habitline_checkpointBranch` at `21082e45a33add879678bf68db3d67d5ba0a5b19` with a clean working tree. The starting commit contains Stage D's chart-lint verification record and was local when work began. The live remote was at the verified Stage D implementation `d7025e4bc474d61c819e74f8b838e205f4058f82`. The Android package is `com.habitline`, version `1.4-native`, code 5, with minimum API 26 and compile and target API 34. [Stage D verification](STAGE-D-REPORT.md).

## Implemented

- Habit Details opens the reminder editor. It saves a device-local time and selected weekdays in Room, and supports edits and disabling. Unique inexact WorkManager timers exclude completed, archived, deleted and unscheduled occurrences.
- The notification channel uses one notification identity per habit. A tap opens the correct Habit Details screen. Mark Complete validates the delivered reminder and uses the existing Room completion and XP transaction. The Android 13+ permission request is user-initiated and offered once. Denial leaves reminder settings and widgets available.
- The existing home-screen widget displays today's completed and scheduled counts, visible habit rows, and an empty state. Each widget can show the overview or prioritize one habit. Visible rows support detail navigation and completion. Undo checks the specific completion the widget displayed.
- Reconciliation runs on process entry, clock and time-zone changes, boot and app update. It also runs after relevant app and widget mutations and at local midnight for installed widgets. Delivery may be delayed by Android background restrictions.
- Reminder state reuses Stage D's nullable reminder time and preference table. The version-1 Room schema, Room records and legacy importer match Stage D, so there is no migration to apply. The hosted upgrade test confirmed preservation using the actual Stage D debug APK.

## Verification

| Check | Result |
| --- | --- |
| Android JVM unit tests | 17 passed, including five Stage E planner and widget-state tests. |
| Android source, resources and Room SQL | 32 application and instrumentation Kotlin sources type-checked against API 34. AAPT2 resource compilation and reference checks passed. SQLite validated 39 DAO queries against the Stage D Room schema snapshot. |
| Automation syntax | GitHub Actions workflow passed actionlint. The emulator shell script passed Bash syntax validation. All four Python smoke scripts parsed. |
| Web and backend regressions | All 11 Node tests passed on GitHub. Edge reached browser startup and aborted because its installed Linux sandbox helper failed the ownership and permissions check. The full Edge test passed locally with Vite colors enabled. |
| Production web build | Passed on GitHub and locally with the existing Vite warning for a minified chunk above 500 kB. |
| Android instrumentation and emulator | API 26 passed all three native tests. API 34 passed all 12 instrumentation tests and the offline UI, upgrade, permission denial, and reboot smoke checks. |
| Android lint | Passed with zero errors and 39 warnings, down from 51 warnings and zero errors on Stage D. The chart constructor finding remained absent. The sole new finding is a WorkManager dependency update suggestion. |
| APK and reports | Both archive digests matched GitHub. The debug APK is `com.habitline` version `1.4-native` (5), min API 26, target API 34. The runner and a local verifier confirmed its v2 debug signature. APK SHA-256 `5365ef78802f1f80a55995f819563e0cef778bb19f83ffe5a37e3d6c626d9d82`. The packaged manifest has no Internet or exact-alarm permission. |

The hosted suite builds the real Stage D APK, seeds a habit and completion, goal, challenge and profile, and checks that those records and XP survive the offline upgrade. It covers notification permission denial, restart and disable persistence, reboot work registration, time-zone changes on API 34, timer replacement and cancellation, two real widget bindings, and the widget refresh after a notification completion. The Android job retains the prototype and Stage C/D regressions. An independent hosted job runs the existing web and backend tests, Edge workflow and production web build. [Hosted workflow](../.github/workflows/android-apk.yml).

## First hosted run

Attempt 1 of GitHub Actions run `46121557894` tested commit `e7c9432dc0c916500117038a42b71ad6fc1f5234`. The available Android reports contain API 34 results, lint XML and all 17 passing Android JVM tests. API 26 has setup logs only. Three web/backend regression tests could not open the untracked SQLite inputs on the runner. The hosted Edge test and production web build were skipped after that failure. [Hosted run](https://github.com/Aryankbd16/habitline/actions/runs/46121557894), [debug APK](https://github.com/Aryankbd16/habitline/actions/runs/46121557894/artifacts/15253637825), [verification reports](https://github.com/Aryankbd16/habitline/actions/runs/46121557894/artifacts/15253474890).

The follow-up gives the new JUnit methods explicit `Unit` results, waits for Habit Details to confirm the reminder save before force-stopping, and uses privileged ADB only for setup on the disposable API 26 AOSP emulator. CI now generates synthetic legacy SQLite fixtures with the same preservation assertions. All 11 Node regressions passed locally using those generated fixtures.

## Second hosted run

Attempt 1 of run `46125198549` verified commit `8734c40f5554a5b420aeb0e8c11cfc86882491f0`. The Android job passed all gates. The verified reports contain the separate API 26 and 34 XML results, logs, unit XML and lint XML. The hosted web job passed all 11 Node tests and timed out before launching Edge because its startup parser expected Vite's port without terminal color codes. The local parser repair passed the full Edge workflow with colors enabled. The workflow now lets the production web build report independently after dependencies install. [Hosted run](https://github.com/Aryankbd16/habitline/actions/runs/46125198549), [debug APK](https://github.com/Aryankbd16/habitline/actions/runs/46125198549/artifacts/15255063111), [verification reports](https://github.com/Aryankbd16/habitline/actions/runs/46125198549/artifacts/15254894921).

## Third hosted run

Attempt 1 of run `46128522470` verified commit `505a48601468997d475f86ab6c6d4b3c9cc4024e`. The Android job passed with 3 API 26 tests, 12 API 34 tests, 17 JVM tests, 0 lint errors and 39 lint warnings. The offline upgrade, permission denial and reboot checks passed. All 11 hosted web/backend tests and the production web build also passed. Both artifact archive digests matched GitHub. [Hosted run](https://github.com/Aryankbd16/habitline/actions/runs/46128522470), [debug APK](https://github.com/Aryankbd16/habitline/actions/runs/46128522470/artifacts/15257006532), [verification reports](https://github.com/Aryankbd16/habitline/actions/runs/46128522470/artifacts/15256284528).

The browser reached Edge startup after detecting Vite's URL. Edge terminated before creating its DevTools port and reported invalid sandbox helper ownership or permissions at `/opt/microsoft/msedge/msedge-sandbox`. The corresponding Microsoft Edge Debian package ships the helper as `root:root` with mode `4755`. The local workflow correction verifies the installed helper against its package metadata and restores those settings on the disposable browser runner. The browser sandbox remains enabled. The correction passed actionlint and Bash syntax validation and still needs execution on GitHub. [Hosted Edge logs](https://github.com/Aryankbd16/habitline/actions/runs/46128522470/job/140928375253), [Chromium sandbox check](https://chromium.googlesource.com/chromium/src/+/464aa0583bd49069e60cec7f24b2f78cb5b19212/sandbox/linux/suid/client/setuid_sandbox_host.cc).

Physical launcher coverage, OEM-specific power behavior, and Android versions above API 34 remain unverified. [Plan](STAGE-E-PLAN.md), [audit](STAGE-E-AUDIT.md).
