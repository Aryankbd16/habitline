"""Exercise the installed Stage C APK through the native UI with radios off."""

import argparse
import re
import subprocess
import time
from xml.etree import ElementTree

from prototype_smoke import ACTIVITY, PACKAGE, adb


PREFIX = PACKAGE + ":id/"
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def hierarchy():
    adb("shell", "uiautomator", "dump", "/sdcard/stage-c-window.xml")
    return ElementTree.fromstring(adb("exec-out", "cat", "/sdcard/stage-c-window.xml"))


def find(resource, *, scroll=False, **attributes):
    resource_id = resource if ":id/" in resource else PREFIX + resource
    tree = None
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        try:
            tree = hierarchy()
        except (subprocess.CalledProcessError, ElementTree.ParseError):
            continue
        for node in tree.iter("node"):
            bounds = [int(value) for value in re.findall(r"\d+", node.get("bounds", ""))]
            if (node.get("resource-id") == resource_id and len(bounds) == 4 and
                    bounds[2] > bounds[0] and bounds[3] > bounds[1] and
                    all(matches(node, key, value) for key, value in attributes.items())):
                return node
        if scroll:
            x, y = [int(value) for value in re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))[-1]]
            start, end = (y // 3, y * 3 // 4) if scroll == "up" else (y * 3 // 4, y // 3)
            adb("shell", "input", "swipe", str(x // 2), str(start), str(x // 2), str(end), "350")
        else:
            time.sleep(0.2)
    if tree is not None:
        ElementTree.ElementTree(tree).write("android/stage-c-window.log", encoding="utf-8")
    raise AssertionError(f"Timed out waiting for {resource_id} {attributes}")


def matches(node, key, value):
    actual = node.get(key, "")
    return actual.split() == value.split() if key == "text" else actual == value


def tap(resource, **attributes):
    left, top, right, bottom = map(int, re.findall(r"\d+", find(resource, **attributes).get("bounds")))
    adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))


def launch():
    adb("shell", "am", "start", "-W", "-n", ACTIVITY)


def restart():
    adb("shell", "am", "force-stop", PACKAGE)
    launch()


def input_text(resource, text, expected, *, scroll=False):
    tap(resource, scroll=scroll)
    find(resource, focused="true")
    adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    adb("shell", "input", "text", text)
    find(resource, text=expected)
    if "mInputShown=true" in adb("shell", "dumpsys", "input_method"):
        adb("shell", "input", "keyevent", "KEYCODE_BACK")


def offline():
    expected = {"airplane_mode_on": "1", "wifi_on": "0", "mobile_data": "0"}
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        actual = {key: adb("shell", "settings", "get", "global", key).strip() for key in expected}
        if actual == expected:
            return
        time.sleep(0.5)
    raise AssertionError(f"Emulator radios were not disabled: {actual}")


def verify_upgrade():
    offline()
    launch()
    tap("nav_habits")
    find("habitName", text="⭐  OfflineSmoke")
    tap("nav_dashboard")
    tap("checkButton", selected="false", enabled="true")
    find("checkButton", selected="true")
    restart()
    find("habitName", text="⭐  OfflineSmoke")
    find("checkButton", selected="true")
    print("Prototype habit was migrated, marked and reopened in Stage C in airplane mode.")


def verify_core():
    offline()
    launch()
    find("empty_state", text="Create a habit to start tracking your routine.")
    tap("fabAdd")
    tap("save_habit", scroll=True, enabled="true")
    find("editor_error", text="Enter a habit name between 1 and 120 characters.", scroll=True)
    input_text("input_name", "OfflineCore", "OfflineCore", scroll="up")

    # Confirm Android recreates the screen in both orientations and retains the draft.
    adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
    try:
        for rotation in ("1", "0"):
            adb("shell", "wm", "user-rotation", "lock", rotation)
            end = time.monotonic() + 15
            while hierarchy().get("rotation") != rotation:
                if time.monotonic() >= end:
                    raise AssertionError("Emulator did not rotate to the requested orientation")
                time.sleep(0.25)
            find("input_name", text="OfflineCore")
    finally:
        adb("shell", "wm", "user-rotation", "lock", "0")

    tap("weekdays", scroll=True)
    weekday = int(adb("shell", "date", "+%u").strip()) - 1
    for index, choice in enumerate(WEEKDAYS):
        checked_by_default = index < 5
        should_be_checked = index == weekday
        if checked_by_default != should_be_checked:
            tap(choice, scroll=True, checked=str(checked_by_default).lower())
    tap("save_habit", scroll=True, enabled="true")

    find("daily_totals", text="1 scheduled\n0 completed\n1 remaining")
    tap("checkButton", enabled="true", selected="false")
    find("daily_totals", text="1 scheduled\n1 completed\n0 remaining")
    find("daily_percent", text="100%")
    tap("nav_calendar")
    month = find("month_label").get("text")
    tap("next_month")
    assert find("month_label").get("text") != month
    tap("previous_month")
    find("month_label", text=month)
    tap("show_today", scroll=True)
    find("calendar_summary", text="1 of 1 scheduled completed", scroll=True)
    find("habitMeta", text="General · Complete", scroll=True)

    restart()
    find("habitName", text="⭐  OfflineCore")
    find("checkButton", selected="true")
    find("daily_percent", text="100%")
    tap("nav_habits")
    tap("habit_detail")
    tap("edit_habit", scroll=True)
    input_text("input_name", "Updated", "OfflineCoreUpdated")
    tap("save_habit", scroll=True, enabled="true")
    find("detail_name", text="⭐  OfflineCoreUpdated")
    tap("archive_habit", scroll=True)
    tap("android:id/button1", enabled="true")
    find("archive_habit", text="Restore habit", scroll=True)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    find("habits_empty", text="No active habits. Create a habit to get started.")
    tap("nav_calendar")
    find("calendar_summary", text="Recorded completions · 1", scroll=True)
    find("habitMeta", text="General · Recorded completion", scroll=True)
    tap("nav_habits")
    tap("archived_habits")
    tap("habit_detail")
    tap("archive_habit", scroll=True)
    find("archive_habit", text="Archive habit", scroll=True)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    tap("nav_dashboard")
    tap("checkButton", enabled="true", selected="true")
    find("daily_totals", text="1 scheduled\n0 completed\n1 remaining")
    tap("nav_calendar")
    find("calendar_summary", text="0 of 1 scheduled completed", scroll=True)

    tap("nav_habits")
    tap("active_habits")
    tap("habit_detail")
    tap("delete_habit", scroll=True)
    tap("android:id/button1", enabled="true")
    find("habits_empty", text="No active habits. Create a habit to get started.")

    tap("nav_profile")
    input_text("profile_name", "Ava", "Ava")
    input_text("profession", "Designer", "Designer")
    tap("theme_dark", scroll=True)
    tap("save_profile", scroll=True, enabled="true")
    find("theme_dark", checked="true", enabled="true", scroll=True)
    tap("nav_dashboard")
    assert "Ava" in find("greeting").get("text")
    restart()
    assert "Ava" in find("greeting").get("text")
    tap("nav_profile")
    find("profession", text="Designer")
    find("theme_dark", checked="true", scroll=True)
    offline()
    print("Stage C native UI passed offline validation, rotation, tracking, calendar, restart, CRUD and profile checks.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-upgrade", action="store_true")
    if parser.parse_args().verify_upgrade:
        verify_upgrade()
    else:
        verify_core()
