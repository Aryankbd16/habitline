"""Exercise the phase-one UI on a fresh, offline emulator using Android's UI hierarchy."""

import re
import subprocess
import sys
import time
from xml.etree import ElementTree


PACKAGE = "com.habitline"
ACTIVITY = PACKAGE + "/.ui.MainActivity"


def adb(*args):
    return subprocess.check_output(["adb", *args], text=True, timeout=30)


def find(resource, **attributes):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
        tree = ElementTree.fromstring(adb("exec-out", "cat", "/sdcard/window.xml"))
        for node in tree.iter("node"):
            if node.get("resource-id") == resource and all(
                node.get(key) == value for key, value in attributes.items()
            ):
                return node
        time.sleep(0.3)
    with open("android/emulator-window.log", "wb") as out:
        out.write(ElementTree.tostring(tree, encoding="utf-8"))
    raise AssertionError(f"Timed out looking for {resource} {attributes}")


def tap(resource):
    left, top, right, bottom = map(int, re.findall(r"\d+", find(resource).get("bounds")))
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))


def main():
    prefix = PACKAGE + ":id/"
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    if sys.argv[1:] == ["--verify-upgrade"]:
        assert "OfflineSmoke" in find(prefix + "habitName").get("text")
        find(prefix + "checkButton", selected="false")
        tap(prefix + "checkButton")
        find(prefix + "checkButton", selected="true")
        adb("shell", "am", "force-stop", PACKAGE)
        adb("shell", "am", "start", "-W", "-n", ACTIVITY)
        find(prefix + "checkButton", selected="true")
        print("Existing habit survived an offline in-place upgrade and restart.")
        return
    find(prefix + "emptyState")
    tap(prefix + "fabAdd")
    tap(prefix + "input_name")
    find(prefix + "input_name", focused="true")
    adb("shell", "input", "text", "OfflineSmoke")
    find(prefix + "input_name", text="OfflineSmoke")
    if "mInputShown=true" in adb("shell", "dumpsys", "input_method"):
        adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap("android:id/button1")
    assert "OfflineSmoke" in find(prefix + "habitName").get("text")
    tap(prefix + "checkButton")
    find(prefix + "checkButton", selected="true")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)
    assert "OfflineSmoke" in find(prefix + "habitName").get("text")
    find(prefix + "checkButton", selected="true")
    tap(prefix + "checkButton")
    find(prefix + "checkButton", selected="false")
    print("Offline create, complete, restart and undo passed on API 34.")


if __name__ == "__main__":
    main()
