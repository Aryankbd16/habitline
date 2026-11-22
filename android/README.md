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

You'll need **Android Studio** (Hedgehog or newer) with the Android SDK for
API 34 installed — Gradle will pull dependencies (AndroidX, Material
Components) from Google's Maven repository the first time, so you'll need
internet access for that initial sync (this is normal Android development,
not a Phase-1 requirement being broken).

```
Open Android Studio
    → File → Open → select the `android/` folder
    → Wait for Gradle sync to finish
    → Run ▶ on a connected device or emulator (API 26+)
```

To build an installable APK directly:

```
Build → Build Bundle(s) / APK(s) → Build APK(s)
```

The APK will be generated under `app/build/outputs/apk/debug/`. Copy it to
your phone (or use `adb install app-debug.apk`) to install without any app
store.

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
