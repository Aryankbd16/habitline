"""Seed the verified Stage C APK and exercise its data on Stage D offline."""

import argparse
import re
import time
from xml.etree import ElementTree

from stage_c_smoke import adb, find, hierarchy, input_text, launch, offline, restart, tap


def text_node(text, *, click=False):
    deadline = time.monotonic() + 25
    tree = None
    while time.monotonic() < deadline:
        tree = hierarchy()
        for node in tree.iter("node"):
            bounds = [int(value) for value in re.findall(r"\d+", node.get("bounds", ""))]
            if node.get("text", "").casefold() == text.casefold() and len(bounds) == 4 and bounds[0] < bounds[2] and bounds[1] < bounds[3]:
                if click:
                    adb("shell", "input", "tap", str((bounds[0] + bounds[2]) // 2), str((bounds[1] + bounds[3]) // 2))
                return node
        time.sleep(0.25)
    if tree is not None:
        ElementTree.ElementTree(tree).write("android/stage-d-window.log", encoding="utf-8")
    raise AssertionError(f"Visible text {text!r} was not found")


def seed_stage_c():
    offline()
    launch()
    tap("fabAdd")
    input_text("input_name", "StageCProgress", "StageCProgress")
    tap("save_habit", scroll=True)
    find("habitName", text="⭐  StageCProgress")
    tap("checkButton", enabled="true", selected="false")
    find("daily_percent", text="100%")
    tap("nav_profile")
    input_text("profile_name", "Morgan", "Morgan")
    tap("save_profile", scroll=True)
    tap("nav_dashboard")
    assert "Morgan" in find("greeting").get("text")
    print("Seeded the verified Stage C APK with a persisted habit, completion, XP and profile.")


def create_target(label, title):
    text_node(label, click=True)
    tap("progress_add", enabled="true")
    input_text("target_title", title, title)
    input_text("target_count", "1", "1")
    tap("target_links", scroll=True, enabled="true")
    text_node("StageCProgress", click=True)
    tap("android:id/button1", enabled="true")
    tap("target_save", scroll=True, enabled="true")
    text_node(title)
    text_node("Completed")
    text_node("1 of 1 · 100%")


def verify_stage_d():
    offline()
    launch()
    assert "Morgan" in find("greeting").get("text")
    find("habitName", text="⭐  StageCProgress")
    find("checkButton", selected="true")
    tap("nav_progress")
    find("analytics_completion", text="Completion rate · 100%", scroll=True)
    tap("analytics_range", scroll="up")
    text_node("Month", click=True)
    find("analytics_completion", text="Completion rate · 100%", scroll=True)
    tap("analytics_habit", scroll="up")
    text_node("StageCProgress", click=True)
    find("analytics_completion", text="Completion rate · 100%", scroll=True)

    create_target("Goals", "ReadToday")
    create_target("Challenges", "OneDayChallenge")
    restart()
    tap("nav_progress")
    text_node("Goals", click=True)
    text_node("ReadToday")
    text_node("Challenges", click=True)
    text_node("OneDayChallenge")
    text_node("Rewards", click=True)
    find("rewards_level", text="Level 1")
    text_node("10 XP · 90 to level 2")

    tap("nav_dashboard")
    tap("checkButton", selected="true", enabled="true")
    find("daily_percent", text="0%")
    tap("nav_progress")
    text_node("Rewards", click=True)
    text_node("0 XP · 100 to level 2")
    text_node("Goals", click=True)
    text_node("0 of 1 · 0%")
    offline()
    print("Stage D preserved Stage C Room data and passed offline analytics, goals, challenges, restart and XP undo.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed-stage-c", action="store_true")
    if parser.parse_args().seed_stage_c:
        seed_stage_c()
    else:
        verify_stage_d()
