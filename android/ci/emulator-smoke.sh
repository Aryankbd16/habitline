#!/usr/bin/env bash
# Run on the disposable GitHub Linux runner from the checkout root.
set -euo pipefail
tools="$ANDROID_HOME/cmdline-tools/latest/bin"
image='system-images;android-34;default;x86_64'
"$tools/sdkmanager" emulator "$image"
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
"$tools/avdmanager" create avd --name habitline-smoke --package "$image" <<< no
export PATH="$ANDROID_HOME/platform-tools:$PATH"
"$ANDROID_HOME/emulator/emulator" -avd habitline-smoke -port 5554 \
  -no-window -no-audio -no-boot-anim -no-snapshot -gpu swiftshader_indirect \
  > android/emulator-boot.log 2>&1 &
emulator_pid=$!
export ANDROID_SERIAL=emulator-5554
trap 'kill "$emulator_pid" 2>/dev/null || true' EXIT
timeout 180 adb wait-for-device
timeout 240 bash -c 'until [[ "$(adb shell getprop sys.boot_completed | tr -d "\r")" == 1 ]]; do sleep 2; done'
adb shell wm dismiss-keyguard
adb install android/app/build/outputs/apk/debug/app-debug.apk
adb shell cmd connectivity airplane-mode enable
[[ "$(adb shell settings get global airplane_mode_on | tr -d '\r')" == 1 ]]
adb shell svc wifi disable
adb shell svc data disable
python3 android/ci/prototype_smoke.py
