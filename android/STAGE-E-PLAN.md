# Habitline Stage E plan

Work started on `habitline_checkpointBranch` at `21082e45a33add879678bf68db3d67d5ba0a5b19` with a clean tree. That documentation commit was local. The remote branch pointed to verified Stage D code `d7025e4bc474d61c819e74f8b838e205f4058f82`. All three Stage D records were available locally. [Stage D verification](STAGE-D-REPORT.md).

| Work | Implementation and evidence |
| --- | --- |
| Reminder storage and timing | Use the Room habit's reminder time and per-habit preferences for weekdays and delivery receipts. Exercise schedules, date boundaries, daylight saving, edits, disable and uniqueness. |
| Background execution | Use unique inexact WorkManager timers with an active-reminder recovery check. Reconcile on app entry, boot, update, and clock or time-zone changes. |
| Notifications | Use an Android channel, an explicit permission request on API 33+, immutable actions and Room-validated completion. |
| Widgets | Keep the existing provider and widget bindings. Add today’s progress, a compact habit list, optional focus and safe completion or undo for visible occurrences. |
| Regression and upgrade | Preserve the prototype, Stage C and Stage D regression paths. Build the actual Stage D APK for the Stage E upgrade, add reboot and permission UI checks, and run native instrumentation on API 26 and 34. |
| Distribution | Verify lint, test reports and the debug APK after approval for the exact local commit. |

WorkManager persists scheduled work and supports inexact delivery without exact-alarm access. Android's execution and power policies determine delivery latency. [Android WorkManager documentation](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work).
