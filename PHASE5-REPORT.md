# Android implementation record

## Stage A — source and recovery

The source checkpoint is `8dc549d88534089f81d97706e6e7bdc5907408fb`. The hosted-build checkpoint is `46fb82b3c8cdbeffd4d47e4aa7d57546158135b7` on `habitline_checkpointBranch`. Both commits have the same `android/app` Git tree, `87b7b3d761a4f35f934497d1bbc4038635bcee5e`. This comparison covers the app build file, Kotlin sources, manifest, resources and widget.

The local recovery folder is `%LOCALAPPDATA%\Habitline\recovery\stage-a-dc947f9bf9ff`. Its 91,788,257-byte `workspace.zip` contains 27,660 verified entries. The accompanying `manifest.json` records their SHA-256 hashes. The archive includes existing source, Git files, generated files, dependencies, preceding backups and the wrapper downloads present during the inventory. Use the recorded Git commit to reproduce the pristine tracked source.

SQLite's online backup API copied the active database through a read-only connection. The verified database replaces the live DB/WAL/SHM trio inside the archive. A separate read-only comparison of the extracted database and the active database found matching schemas and rows across all 20 tables. Both returned `ok` for integrity and zero foreign-key violations. The recovery archive contains private local account data and is stored outside the checkout.

To inspect or recover, extract into a fresh directory. Verify files against the manifest and run SQLite integrity and foreign-key checks on the extracted database. Start a separate local server using `DATABASE_PATH` pointing to a working copy of that extracted database. Use the existing installation until the recovered copy has been checked. A source rollback and a data restore are independent operations.

## Stage A changes

| Files | Purpose |
| --- | --- |
| `android/gradlew`, `android/gradlew.bat`, `android/gradle/wrapper/gradle-wrapper.jar` and properties, `.gitattributes` | Restore the official 8.7 bootstrap, pin the distribution checksum and preserve Linux executable content. |
| `.github/workflows/android-apk.yml` | Hosted packaging, APK manifest and signature verification, artifact size/digest, emulator smoke test, Gradle checks and optional environment-protected release signing. |
| `android/ci/emulator-smoke.sh`, `android/ci/prototype_smoke.py` | Install the debug APK into a fresh API 34 emulator and exercise local creation, mark, process restart and undo with airplane mode enabled. |
| `README.md`, `android/README.md`, `PHASE5-PLAN.md`, `PHASE5-AUDIT.md`, this report | Build, install, sign and recover instructions, product comparison, staged acceptance and verification record. |

Database/schema changes in Stage A: none. Product features implemented in Stage A: build and distribution infrastructure. The baseline still uses SharedPreferences.

## Local verification

| Check | Actual outcome |
| --- | --- |
| Gradle wrapper | Downloaded from Gradle's v8.7.0 source tag. JAR SHA-256 `cb0da6751c2b753a16ac168bb354870ebb1e162e9083f116729cec9c781156b8` matched the published value. Binary distribution SHA-256 `544c35d6bd849ae8a5ed0bcea39ba677dc40f49df7d1835561582da2009b961d` is pinned in properties. |
| Actions workflow | actionlint 1.7.7 exited 0. Python parsed the smoke script. Neither check executes Android. |
| Phase 2–4 Node suites | Initial restricted run completed four calculation tests and failed three local API fetches. Rerun with loopback access, the documented pre-Phase-4 backup and level step 100 passed all seven tests. |
| Existing Edge browser suite | `node tests/stage2-browser.cjs` exited 0 against disposable data. Browser workflows passed. |
| Frontend production build | `npm.cmd --prefix web run build` exited 0 and produced the PWA. Vite reported a chunk larger than 500 kB. |
| Frontend lint | `npm.cmd --prefix web run lint` exited 0 with four existing Fast Refresh warnings. |

## Hosted build

The authorized checkpoint push started [Android APK run 45984834665](https://github.com/Aryankbd16/habitline/actions/runs/45984834665). The run identifies the exact commit and retains job logs. Physical-device installation, old-signer upgrade, release signing and Phase 5 feature acceptance require their own evidence.

The runner successfully assembled and verified the debug APK. [Download the baseline artifact](https://github.com/Aryankbd16/habitline/actions/runs/45984834665/artifacts/15190448491). The archive SHA-256 matched GitHub's published digest on retrieval. Local inspection of the extracted APK found a compiled manifest, resources, DEX and passing ZIP integrity.

| Baseline APK | Verified value |
| --- | --- |
| Local and runner output | `android/app/build/outputs/apk/debug/app-debug.apk` |
| Package | `com.habitline` |
| Version | `1.0-phase1`, code 1 |
| Minimum in manifest | API 26 |
| APK size | 5,944,441 bytes |
| APK SHA-256 | `2a657025625e8172bac3d5eb984bad0a92e143188b79d0defce11dacbd4c4bb1` |

Run 45984834665 ended in failure after successful packaging. The emulator reported `Unknown AVD name [habitline-smoke]` before APK installation. Android JVM tests and lint were skipped in that run. The [checks artifact](https://github.com/Aryankbd16/habitline/actions/runs/45984834665/artifacts/15191776382) includes Gradle output, packaged manifest and emulator logs. The local follow-up sets an explicit virtual-device directory for both tools, checks discovery before boot, detects early emulator exit, and schedules Gradle checks independently of emulator success.

The authorized follow-up [run 45985864961](https://github.com/Aryankbd16/habitline/actions/runs/45985864961) built the same app module, booted API 34, installed the debug APK and entered the add-habit dialog in airplane mode. The smoke test timed out waiting for the newly created habit's label. That run did not verify completion, restart or undo. Android lint produced 0 errors and 38 warnings. The baseline JVM task reported `NO-SOURCE`. [Second run logs](https://github.com/Aryankbd16/habitline/actions/runs/45985864961/artifacts/15191837540).

## Stage B — Room storage checkpoint

The Kotlin storage implementation introduces Room database version 1, app version `1.1-storage` (code 2). The phone creates a local profile on its first successful transaction. Habit creation, desired completion state, undo and deletion update the tracker and its mutation outbox atomically. Unique habit/day and completion/event constraints protect repeat writes. Widget configuration and completion use the same repository. The UI observes committed records through Flow. The laptop schema and API have no changes in this checkpoint.

The Room entities and DAO are under `android/app/src/main/java/com/habitline/data/`. They model profile, habits, schedule revisions, completion snapshots, XP events, goal and challenge links, earned milestones, cached social records, preferences, widget bindings, mutation history, tombstones, cursors and the migration marker. Product screens for goals, challenges, pairing and backups still require implementation.

The migration reads the version-one preferences directly, checks types, IDs, dates and references, rejects duplicate object keys, collapses exact duplicate legacy completion pairs and compares the imported sets inside the transaction. It retains the original JSON. Its SHA-256 is recorded with the migration marker. The legacy store has date-only completions and no saved XP or historical points. Migrated rows preserve the local date, use the available habit points and leave the unknown completion instant and XP unset. The creation instant is converted to the device's local date on first migration because the old store does not record the creation time zone. A failed migration leaves tracking unavailable and offers export of the original JSON for recovery.

The Stage B changes include the Android Gradle files, manifest, strings, repository and records, the two activities, both widget entry points, CI upgrade checks, Kotlin unit and instrumentation tests, and the shared schedule fixture with its Node test. Node passed that fixture. The hosted workflow is configured to build the original app and upgrade it using the same signing certificate, compare the original preference files, exercise local writes after restart and run database tests on the emulator. These are pending executions until the corresponding run reports results.

### Storage build results

The authorized Stage B commit `0012136` produced [the Room debug APK](https://github.com/Aryankbd16/habitline/actions/runs/45986843802/artifacts/15190904350). The package is `com.habitline`, version `1.1-storage`, code 2, min API 26, target API 34. The extracted APK is 6,221,119 bytes with SHA-256 `beb2fdf5d1f2d59c3a8ca72add853f4033e08e177edd966905800593e9219f88`. A verified local copy is in `android/build/distributions/habitline-1.1-storage-45986843802-debug.apk`.

| Check in run 45986843802 | Result |
| --- | --- |
| Original prototype in airplane mode on API 34 | Created a habit, completed it, force-stopped and relaunched, verified the completion and undid it. |
| In-place signed upgrade on API 34 | Installed the Room APK over the prototype, found the original habit, marked it, force-stopped, relaunched and verified the mark. Original preferences XML compared byte for byte after upgrade. |
| Room instrumentation | Four tests passed. Covered first use, preserved UUIDs/dates/widget mapping, duplicate date handling, retained JSON, replay, corrupt input, rollback, foreign keys, unique completion, concurrent widget operations, XP reversal and tombstones. |
| JVM and Node | Two Kotlin unit tests passed. Node and Kotlin passed the shared historical schedule, streak and time-zone fixture. |
| Android lint | 2 errors and 47 warnings. Both errors refer to the same numeric argument supplied for a string placeholder on the habit card. The follow-up formats points with the locale's number formatter before interpolation. |

[Build and test run](https://github.com/Aryankbd16/habitline/actions/runs/45986843802), [logs, generated schema and reports](https://github.com/Aryankbd16/habitline/actions/runs/45986843802/artifacts/15192325623). The Room v1 schema snapshot is pinned under `android/app/schemas/`. Device coverage is the API 34 emulator. Physical devices, API 26, device reboot, launcher placement and a publisher-signed release still require validation.
