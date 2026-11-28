"""Stage D upgrade and Android 13+ permission lifecycle checks."""

import argparse

from stage_c_smoke import find, launch, offline, restart, tap
from stage_d_smoke import create_target, seed_stage_c, text_node


def seed_stage_d():
    seed_stage_c()
    tap("nav_progress")
    create_target("Goals", "NativeUpgradeGoal")
    create_target("Challenges", "NativeUpgradeChallenge")
    print("Seeded Stage D with a habit, goal, challenge, XP and profile.")


def open_reminder():
    tap("nav_habits")
    tap("habit_detail")
    tap("habit_reminder", scroll=True)


def verify_stage_e():
    offline()
    launch()
    assert "Morgan" in find("greeting").get("text")
    find("habitName", text="⭐  StageCProgress")
    find("checkButton", selected="true")
    tap("nav_progress")
    text_node("Goals", click=True)
    text_node("NativeUpgradeGoal")
    text_node("Challenges", click=True)
    text_node("NativeUpgradeChallenge")
    text_node("Rewards", click=True)
    text_node("10 XP · 90 to level 2")

    open_reminder()
    tap("reminder_enabled", checked="false")
    tap("reminder_permission", scroll=True)
    tap("com.android.permissioncontroller:id/permission_deny_button")
    find("reminder_permission_message", text="Enable notifications to receive this reminder.", scroll=True)
    tap("save_reminder", scroll=True)
    restart()
    open_reminder()
    find("reminder_enabled", checked="true")
    find("reminder_permission_message", text="Enable notifications to receive this reminder.", scroll=True)
    offline()
    print("Stage E preserved Stage D records and saved an enabled reminder after permission denial.")


def verify_after_reboot():
    offline()
    launch()
    open_reminder()
    find("reminder_enabled", checked="true")
    tap("reminder_enabled", checked="true")
    tap("save_reminder", scroll=True)
    restart()
    open_reminder()
    find("reminder_enabled", checked="false")
    offline()
    print("The Stage E reminder survived reboot, and disabling it persisted after a process restart.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    options = parser.add_mutually_exclusive_group()
    options.add_argument("--seed-stage-d", action="store_true")
    options.add_argument("--after-reboot", action="store_true")
    args = parser.parse_args()
    if args.seed_stage_d:
        seed_stage_d()
    elif args.after_reboot:
        verify_after_reboot()
    else:
        verify_stage_e()
