# Habitline Stage D plan

Work started at `cd4c263` on `habitline_checkpointBranch` with a clean working tree. Its parent, `e7b60d4`, is the verified Stage C application. [Stage C verification](STAGE-C.md).

| Work | Implementation | Evidence |
| --- | --- | --- |
| Analytics | Add a native Progress destination with weekly, monthly and lifetime views, matched elapsed comparisons, per-habit drill-down, points, focus, streaks and charts. Keep schedule and completion rules in Kotlin domain code. | Run the same fixtures through the web and Kotlin engines, including boundaries and historical schedules. |
| Insights | Port the web observation rules with integer cross products before rounding. | Cover insufficient evidence, improvements and declines, 9.52 points and exactly 10 points. |
| Goals and challenges | Use the existing Room entities for dated targets and atomically replace links. Derive progress from persisted marks. | Exercise inclusive windows, archive cutoffs, duplicate prevention, streak mode and persistence. |
| Rewards | Reuse the reversible XP ledger. Compute levels from its balance and insert immutable award snapshots in the write transaction. Backfill evidence available in Stage C. | Check reversal, re-completion, level thresholds, streak awards, immutable history and upgrade preservation. |
| Hosted checks | Keep the prototype upgrade, Stage C UI regression and Room checks. Add an upgrade from the actual Stage C APK and a Stage D airplane-mode smoke test. | Verify the debug APK, instrumented Room tests, Kotlin JVM tests, lint and emulator workflow on the approved commit. |
| Connectivity | Keep shared challenges and social operations with the authenticated web backend until Stage F supplies secure LAN pairing. | Audit the existing transport and authorization boundaries. |

The local acceptance check includes the Phase 2–4 Node suites, Edge browser integration, the production web build, direct Kotlin JVM execution, Android source and resource validation and workflow syntax. The hosted run requires explicit approval for a push of the exact local implementation commit.
