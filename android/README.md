# Habitline Widget — Android Module (Phase 1)

A native Android home-screen widget prototype, plus a small companion app
used to add/manage the habits the widget can display.

## Why this is a separate app, not "the same app on Android"

The web app uses an Express and SQLite API. The native Android app and widget use their own on-device SharedPreferences and have no client for that API. Section 3 of the spec
anticipated this: *"A normal browser/web application cannot directly create
a native Android home-screen widget."* So this module is a real, separate,
native Android project with its **own local storage**, not a wrapper around
the website.

## What actually works right now

- Add habits (name, icon, points) in the companion app
- Mark a habit complete/incomplete with one tap, from the app or directly
  from the widget (no need to open the app)
- Streak calculation for daily habits (see
  `HabitRepository.currentStreak()`)
- A 10-day recent-activity dot strip on the widget face
- Multiple widget instances, each configured to show a different habit
  (long-press home screen → widgets → Habitline)
- Fully offline — everything is stored in `SharedPreferences` as JSON on
  the device

## What does NOT work yet (documented, not hidden)

**There is no live sync between the web app and this Android app/widget.**
They are two independent local data stores. If you create "Study DSA" in
the web app, it will not appear here automatically — you'd need to add it
again in this app.

This is a deliberate Phase-1 boundary, not a bug. The spec explicitly asked
for this to be documented rather than faked (section 23): *"If a fully
synchronized Android widget cannot be implemented cleanly... do not fake
it."*

Options for a future phase (not implemented):
1. **Manual bridge** — export JSON from the web app, use Android's Storage
   Access Framework to import that file into this app.
2. **LAN companion sync** — the Android app could connect to the existing web API while both are on the same network.
3. **Real backend** — both apps talk to a shared account/cloud API. This is
   the eventual Phase-N direction shown in the spec's future architecture
   diagram.

`HabitRepository.kt` has this reasoning documented directly above the class
for future you.

## Project structure

```
android/
├── app/
│   ├── src/main/
│   │   ├── java/com/habitline/
│   │   │   ├── data/          # Habit model + local repository (SharedPreferences)
│   │   │   ├── ui/            # MainActivity, WidgetConfigActivity
│   │   │   └── widget/        # AppWidgetProvider + completion BroadcastReceiver
│   │   ├── res/
│   │   │   ├── layout/        # activity_main, item_habit, widget_habit, dialogs
│   │   │   ├── drawable/      # vector icons, backgrounds
│   │   │   ├── values/        # colors, strings, theme
│   │   │   └── xml/           # AppWidgetProviderInfo
│   │   └── AndroidManifest.xml
│   └── build.gradle.kts
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## Building and running

The [Android APK workflow](../.github/workflows/android-apk.yml) builds the checked-out commit on Ubuntu with JDK 17, Gradle 8.7, API 34 and Build Tools 34.0.0. It verifies the Linux wrapper and official JAR checksums before execution. Gradle verifies its distribution SHA-256. Dependency downloads, compilation and emulation run on GitHub. [Gradle checksum reference](https://gradle.org/release-checksums/).

An authorized push of Android or workflow changes to `habitline_checkpointBranch` starts a debug build. Find **Android APK** in the repository's Actions tab and select the run for the intended commit. Once the workflow is present on the default branch, GitHub also allows **Run workflow** with a branch selector. [GitHub manual workflow rules](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

| Output | Location on runner | Download from the run |
| --- | --- | --- |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | `habitline-<version>-debug-<run>-<attempt>` |
| Verification | Gradle logs, emulator logs, test and lint reports | `android-checks-<run>-<attempt>` and the job log |
| Signed release APK | `release/habitline-release.apk` | `habitline-<version>-release-<run>-<attempt>` |

The run summary records actual APK bytes, SHA-256 and manifest metadata. The baseline declares `com.habitline`, version `1.0-phase1` (code 1), minimum API 26 (Android 8.0). The emulator job exercises the debug APK on API 34. Check the individual job results for device evidence. A debug artifact can be available even if a later test fails.

**Release signing.** Configure the `android-release` GitHub environment with protected refs and reviewers. Use the existing install's signing key for an in-place upgrade. Set environment secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, and environment variable `ANDROID_SIGNING_CERT_SHA256` to the expected 64 hex digits without separators. Store the original keystore securely. Increase the app version code for each distributed update. Request release signing through the manual input or an explicitly published protected `android-v*` tag. Signing runs after the debug checks pass, verifies the actual certificate fingerprint and uploads the signed APK. [Android APK signing](https://developer.android.com/tools/apksigner).

**Installation.** Download and extract the artifact ZIP, compare the APK checksum with the run summary, then open the APK from Files on the phone. Android may ask to allow this file source to install apps. With an already configured ADB connection, use `adb install -r app-debug.apk` or `adb install -r habitline-release.apk`. Hosted debug builds use disposable debug signing keys. Use a fresh emulator for these artifacts. On a phone with existing Habitline data, an update requires a matching signer. Preserve the existing installation if Android reports a signature mismatch.

### Adding the widget to your home screen

1. Open the Habitline Widget app at least once and add a habit.
2. Long-press an empty area of your Android home screen → **Widgets**.
3. Find **Habitline Widget** in the list and drag it onto your home screen.
4. The configuration screen appears — pick which habit this widget instance
   should track.
5. Tap the circle on the widget to mark today's habit complete; tap again
   to undo.

## Known limitations

- No cross-device or cross-app sync with the web app (see above).
- Single-user, single-device local storage only.
- The companion app is intentionally minimal — it exists to feed the
  widget, not to replace the full web app experience.
