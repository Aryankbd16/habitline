#!/usr/bin/env bash
# Run on the disposable GitHub Linux runner from the checkout root.
set -euo pipefail
tools="$ANDROID_HOME/cmdline-tools/latest/bin"
image='system-images;android-34;default;x86_64'
"$tools/sdkmanager" emulator "$image"
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
# Hosted images may set separate SDK and emulator preference directories.
# Write both the AVD registration and disk image to this job's directory.
export ANDROID_USER_HOME="$RUNNER_TEMP/habitline-android"
export ANDROID_EMULATOR_HOME="$ANDROID_USER_HOME"
export ANDROID_AVD_HOME="$ANDROID_USER_HOME/avd"
unset ANDROID_SDK_HOME ANDROID_PREFS_ROOT
mkdir -p "$ANDROID_AVD_HOME"
"$tools/avdmanager" create avd --name habitline-smoke --package "$image" \
  --path "$ANDROID_AVD_HOME/habitline-smoke.avd" <<< no
test -s "$ANDROID_AVD_HOME/habitline-smoke.avd/config.ini"
if [[ ! -s "$ANDROID_AVD_HOME/habitline-smoke.ini" ]]; then
  printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-34\n' \
    "$ANDROID_AVD_HOME/habitline-smoke.avd" > "$ANDROID_AVD_HOME/habitline-smoke.ini"
fi
"$ANDROID_HOME/emulator/emulator" -list-avds | grep -Fx habitline-smoke
export PATH="$ANDROID_HOME/platform-tools:$PATH"
"$ANDROID_HOME/emulator/emulator" -avd habitline-smoke -port 5554 \
  -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect \
  > android/emulator-boot.log 2>&1 &
emulator_pid=$!
export ANDROID_SERIAL=emulator-5554
trap 'kill "$emulator_pid" 2>/dev/null || true' EXIT
for ((attempt=0; attempt<90; attempt++)); do
  if ! kill -0 "$emulator_pid" 2>/dev/null; then
    cat android/emulator-boot.log >&2
    exit 1
  fi
  if [[ "$(adb get-state 2>/dev/null || true)" == device ]]; then break; fi
  sleep 2
done
[[ "$(adb get-state)" == device ]]
timeout 240 bash -c 'until [[ "$(adb shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; do sleep 2; done'
adb shell wm dismiss-keyguard
adb shell wm size 1080x1920
adb shell wm density 360
adb shell settings put system screen_off_timeout 1800000
adb shell settings put secure show_ime_with_hard_keyboard 0
trap 'adb logcat -d -b crash > android/emulator-crash.log 2>&1 || true; kill "$emulator_pid" 2>/dev/null || true' EXIT
adb install "$BASELINE_APK"
adb shell cmd connectivity airplane-mode enable
[[ "$(adb shell settings get global airplane_mode_on | tr -d '\r')" == 1 ]]
adb shell svc wifi disable
adb shell svc data disable
status=0
if python3 android/ci/prototype_smoke.py; then
  adb shell am force-stop com.habitline
  adb exec-out run-as com.habitline cat shared_prefs/habitline_store.xml > "$RUNNER_TEMP/before-upgrade.xml"
else
  status=1
fi
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
if [[ -f "$RUNNER_TEMP/before-upgrade.xml" ]]; then
  python3 android/ci/stage_c_smoke.py --verify-upgrade || status=1
  adb exec-out run-as com.habitline cat shared_prefs/habitline_store.xml > "$RUNNER_TEMP/after-upgrade.xml"
  cmp "$RUNNER_TEMP/before-upgrade.xml" "$RUNNER_TEMP/after-upgrade.xml" || status=1
fi
adb uninstall com.habitline
adb install android/app/build/outputs/apk/debug/app-debug.apk
if ! python3 android/ci/stage_c_smoke.py; then
  adb exec-out screencap -p > android/stage-c-emulator.png || true
  status=1
fi
adb uninstall com.habitline
adb install "$STAGE_C_APK"
if python3 android/ci/stage_d_smoke.py --seed-stage-c; then
  adb shell am force-stop com.habitline
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  if ! python3 android/ci/stage_d_smoke.py; then
    adb exec-out screencap -p > android/stage-d-emulator.png || true
    status=1
  fi
else
  status=1
fi
# Gradle uses the same hosted debug certificate that signed both APKs.
unset ANDROID_USER_HOME ANDROID_EMULATOR_HOME ANDROID_AVD_HOME
android/gradlew -p android --no-daemon --stacktrace :app:connectedDebugAndroidTest || status=1
exit "$status"
