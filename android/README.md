# Habitline for Android

The native app and home-screen widget share an app-private Room database. Open **Today** for scheduled habits and daily progress, **Habits** to manage active and archived habits, **Calendar** for daily history, and **Profile** for local identity and appearance. The app migrates prototype habits, completion dates and widget bindings on first use. A failed migration offers recovery and retains the original preferences. See the [Stage C implementation and verification record](STAGE-C.md).

## Building and running

The [Android APK workflow](../.github/workflows/android-apk.yml) builds the checked-out commit on Ubuntu with JDK 17, Gradle 8.7, API 34 and Build Tools 34.0.0. It verifies the Linux wrapper and official JAR checksums before execution. Gradle verifies its distribution SHA-256. Dependency downloads, compilation and emulation run on GitHub. [Gradle checksum reference](https://gradle.org/release-checksums/).

An authorized push of Android or workflow changes to `habitline_checkpointBranch` starts a debug build. Find **Android APK** in the repository's Actions tab and select the run for the intended commit. Once the workflow is present on the default branch, GitHub also allows **Run workflow** with a branch selector. [GitHub manual workflow rules](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

| Output | Location on runner | Download from the run |
| --- | --- | --- |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` | `habitline-<version>-debug-<run>-<attempt>` |
| Verification | Gradle logs, emulator logs, test and lint reports | `android-checks-<run>-<attempt>` and the job log |
| Signed release APK | `release/habitline-release.apk` | `habitline-<version>-release-<run>-<attempt>` |

The run summary records actual APK bytes, SHA-256 and manifest metadata. Stage C declares `com.habitline`, version `1.2-offline` (code 3), and minimum API 26 (Android 8.0). The workflow checks the packaged Internet permission, tests the prototype upgrade and exercises the installed Stage C APK in airplane mode on API 34. The APK is uploaded before the emulator and lint checks.

**Release signing.** Configure the `android-release` GitHub environment with protected refs and reviewers. Use the existing install's signing key for an in-place upgrade. Set environment secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`, and environment variable `ANDROID_SIGNING_CERT_SHA256` to the expected 64 hex digits without separators. Store the original keystore securely. Increase the app version code for each distributed update. Request release signing through the manual input or an explicitly published protected `android-v*` tag. Signing runs after the debug checks pass, verifies the actual certificate fingerprint and uploads the signed APK. [Android APK signing](https://developer.android.com/tools/apksigner).

**Installation.** Download and extract the artifact ZIP, compare the APK checksum with the run summary, then open the APK from Files on the phone. Android may ask to allow this file source to install apps. With an already configured ADB connection, use `adb install -r app-debug.apk` or `adb install -r habitline-release.apk`. Hosted debug builds use disposable debug signing keys. Use a fresh emulator for these artifacts. On a phone with existing Habitline data, an update requires a matching signer. Preserve the existing installation if Android reports a signature mismatch.

### Adding the widget to your home screen

1. Open Habitline and add an active habit.
2. Long-press an empty area of your Android home screen → **Widgets**.
3. Find **Habitline** in the list and drag its habit widget onto your home screen.
4. The configuration screen appears — pick which habit this widget instance
   should track.
5. Tap the circle on the widget to mark today's habit complete; tap again
   to undo.
