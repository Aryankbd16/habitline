# Habitline Stage E audit

## Verified starting point

The clean local checkpoint was `21082e4`. The live remote branch and local remote-tracking ref both resolved to verified Stage D app code `d7025e4`. The audit inspected the manifest, widget provider and configuration activity, completion receiver, Room v1 schema, schedule projections, repository transactions, and the verified Android workflow. Stage D lint finished with 51 warnings and zero errors. [Stage D audit](STAGE-D-AUDIT.md).

## Storage and timing

Room v1 already has a nullable `LocalHabit.reminderTime`. A valid local wall-clock value enables the reminder and the existing preference table stores its weekday mask, most recent delivery date and consumed completion-action date. Null disables the reminder. Missing weekday preference falls back to all weekdays and the habit schedule still filters dates. The UI defaults a new reminder to the habit's current weekdays. All new state uses the existing entities and indexes. The Stage D schema and legacy importer remain byte-identical, so the upgrade opens the existing database without a schema migration.

The planner intersects the two weekday masks and checks the start date, archive status and current completion. It chooses one future date per habit and converts the local date and time using the device zone. A nonexistent spring time shifts forward by the gap. An ambiguous autumn time uses the earlier offset. Delayed work can deliver on the original local date. After midnight, or a change to the habit or zone, the worker revalidates the ticket and schedules the next eligible date. A monotonic local delivery receipt prevents repeated reminders after dismissal, overlapping work or a clock rollback. The same-day completion receipt consumes a previously posted action even if the user later undoes the mark.

## Lifecycle and power

A serialized reconciliation worker retains identical timers and cancels stale ones. Boot after unlock, app replacement, system clock and time-zone broadcasts, and app resume queue reconciliation. A widget midnight timer, the existing launcher refresh interval, and an hourly recovery check for active reminders cover delayed or missing work. Day changes while the app is open trigger a refresh. Room access and scheduler queries run off the UI thread. Android may delay jobs during Doze, battery restrictions or OEM power management. Android force-stop blocks background work until the user relaunches the app. If the process is killed between a first save and enqueuing work, the next lifecycle reconciliation recreates the timer from Room. [Android broadcast exceptions](https://developer.android.com/develop/background-work/background-tasks/broadcasts/broadcast-exceptions), [WorkManager timing](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work).

## Permissions and action boundaries

API 26–32 use an Android notification channel and the device's app and channel controls. API 33+ offers the permission prompt once on an explicit tap. Further changes use Android notification settings. Saving reminders, tracking and widgets remain available after denial. On the next app resume, permission result or reminder job, the scheduler reads the system's current settings. A brief process interruption during notification posting uses the same per-habit notification tag and ID with alert-once behavior. [Android notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

Notification and widget completion receivers are non-exported. PendingIntents use explicit components, immutable flags and distinct URI identities for their payloads. Notification completion requires a valid delivered ticket for the habit and active local date. A widget action requires a live provider-owned widget ID, the current Room focus binding, the current date and a habit currently shown in its row set. Undo also requires the exact completion ID rendered by that widget. All mutations reuse `HabitRepository.setCompleted`, including the existing XP and achievement transaction. The exported widget configuration activity requires the AppWidget configuration action and a provider-owned ID. It changes a binding after explicit selection.

The APK verification checks the package, minimum Android API and absence of Internet and exact-alarm permissions. The app declares the notification and boot permissions. The WorkManager dependency adds framework scheduling declarations, with jobs configured for offline operation. Stage E excludes data export, new account transport and synchronization.

## Lint and compatibility

The version stays compatible with API 26, using the existing compile and target API 34 configuration. Verification is staged on Android 8.0 and Android 14. Widget layout and row rendering use RemoteViews-supported controls. The layout removes the old decorative progress images and uses accessible completion state descriptions. Hosted lint must compare the final report to Stage D's 51-warning baseline. Physical launchers, OEM-specific background behavior and Android versions above API 34 still need device coverage.
