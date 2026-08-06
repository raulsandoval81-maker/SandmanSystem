#!/usr/bin/env python3

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent
MESSAGE_JS = ROOT / "public/connect/message.js"
RULES_FILE = ROOT / "firestore.rules"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def fail(message: str) -> None:
    print(f"❌ {message}")
    sys.exit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)

    if count != 1:
        fail(f"{label}: expected 1 match, found {count}.")

    return text.replace(old, new, 1)


def backup(path: Path) -> Path:
    target = path.with_name(
        f"{path.name}.before-admin-manager-funnel-{STAMP}"
    )
    shutil.copy2(path, target)
    print(f"🛟 Backup: {target.relative_to(ROOT)}")
    return target


def section_between(
    text: str,
    start_marker: str,
    end_marker: str,
    label: str
) -> tuple[str, str, str]:
    start = text.find(start_marker)

    if start == -1:
        fail(f"{label}: start marker not found.")

    end = text.find(end_marker, start)

    if end == -1:
        fail(f"{label}: end marker not found.")

    return text[:start], text[start:end], text[end:]


def patch_message_js(text: str) -> str:
    if 'routingPolicy: "ADMIN_TO_LOCATION_MANAGER"' in text:
        print("ℹ️  Public routing policy already exists.")
        return text

    old = '''      routingStage: "ADMIN_REVIEW",
      assignmentStatus: "UNASSIGNED",

      locationId: null,
'''

    new = '''      routingStage: "ADMIN_REVIEW",
      nextRoutingStage: "MANAGEMENT_TRIAGE",
      routingPolicy: "ADMIN_TO_LOCATION_MANAGER",
      requiredManagerLevel: "LOCATION_MANAGER",
      assignmentStatus: "UNASSIGNED",

      locationId: null,
'''

    return replace_once(
        text,
        old,
        new,
        "message.js routing defaults"
    )


def patch_create_section(section: str) -> str:
    if '"nextRoutingStage"' not in section:
        old = '''          "status",
          "messageStatus",
          "routingStage",
          "assignmentStatus",
'''

        new = '''          "status",
          "messageStatus",
          "routingStage",
          "nextRoutingStage",
          "routingPolicy",
          "requiredManagerLevel",
          "assignmentStatus",
'''

        section = replace_once(
            section,
            old,
            new,
            "create allowed fields"
        )

    if (
        'request.resource.data.routingPolicy ==' not in section
    ):
        old = '''        && request.resource.data.status == "NEW"
        && request.resource.data.messageStatus == "NEW"
        && request.resource.data.routingStage == "ADMIN_REVIEW"
        && request.resource.data.assignmentStatus == "UNASSIGNED"
'''

        new = '''        && request.resource.data.status == "NEW"
        && request.resource.data.messageStatus == "NEW"

        && request.resource.data.routingStage ==
           "ADMIN_REVIEW"

        && request.resource.data.nextRoutingStage ==
           "MANAGEMENT_TRIAGE"

        && request.resource.data.routingPolicy ==
           "ADMIN_TO_LOCATION_MANAGER"

        && request.resource.data.requiredManagerLevel ==
           "LOCATION_MANAGER"

        && request.resource.data.assignmentStatus ==
           "UNASSIGNED"
'''

        section = replace_once(
            section,
            old,
            new,
            "create routing validation"
        )

    return section


def patch_admin_section(section: str) -> str:
    if '"nextRoutingStage",' not in section:
        old = '''            "status",
            "messageStatus",
            "routingStage",
            "assignmentStatus",
'''

        new = '''            "status",
            "messageStatus",
            "routingStage",
            "nextRoutingStage",
            "assignmentStatus",
'''

        section = replace_once(
            section,
            old,
            new,
            "Admin update fields"
        )

    if "Mandatory first handoff" not in section:
        old = '''        && request.resource.data.updatedAt is timestamp;
'''

        new = '''        && request.resource.data.updatedAt is timestamp

        /*
         * Mandatory first handoff:
         *
         * A message at ADMIN_REVIEW must be routed
         * to a selected Location Manager.
         *
         * Admin cannot send it directly to a coach.
         */
        && (
          resource.data.routingStage != "ADMIN_REVIEW"
          ||
          (
            request.resource.data.routingStage ==
              "MANAGEMENT_TRIAGE"

            && request.resource.data.nextRoutingStage ==
              "COACH_ASSIGNED"

            && request.resource.data.assignmentStatus ==
              "PENDING_MANAGEMENT"

            && request.resource.data.locationId is string
            && request.resource.data.locationId.size() > 0

            && request.resource.data.locationName is string
            && request.resource.data.locationName.size() > 0

            && request.resource.data.assignedAdminUid ==
              request.auth.uid

            && request.resource.data.assignedManagerUid
              is string

            && request.resource.data.assignedManagerUid
              .size() > 0

            && request.resource.data.assignedCoachUid == null
          )
        );
'''

        section = replace_once(
            section,
            old,
            new,
            "Admin first-handoff rule"
        )

    return section


def patch_coach_section(section: str) -> str:
    if "resource.data.routingStage in [" not in section:
        old = '''        && request.resource.data.routingStage in [
          "ADMIN_REVIEW",
          "COACH_ASSIGNED",
          "COACH_REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]
'''

        new = '''        // Coaches cannot process messages still at Admin Review.
        && resource.data.routingStage in [
          "COACH_ASSIGNED",
          "COACH_REVIEWING",
          "RESPONDED"
        ]

        && request.resource.data.routingStage in [
          "COACH_ASSIGNED",
          "COACH_REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]
'''

        section = replace_once(
            section,
            old,
            new,
            "Coach routing restriction"
        )

    return section


def patch_rules(text: str) -> str:
    prefix, general_block, suffix = section_between(
        text,
        "    match /general_messages/{messageId} {",
        "    /* --------------------------------------\n"
        "       DEFAULT CLOSED",
        "general_messages block"
    )

    create_prefix, create_section, remainder = section_between(
        general_block,
        "      allow create:",
        "      /*\n"
        "       * Current visibility:",
        "create rules"
    )

    create_section = patch_create_section(create_section)

    admin_prefix, admin_section, coach_and_after = section_between(
        remainder,
        "      allow update: if isAdmin()",
        "      /*\n"
        "       * Current coach receiver behavior.",
        "Admin update rules"
    )

    admin_section = patch_admin_section(admin_section)

    coach_prefix, coach_section, coach_suffix = section_between(
        coach_and_after,
        "      allow update: if staffRole() == \"coach\"",
        "      allow delete: if isAdmin();",
        "Coach update rules"
    )

    coach_section = patch_coach_section(coach_section)

    updated_block = (
        create_prefix
        + create_section
        + admin_prefix
        + admin_section
        + coach_prefix
        + coach_section
        + coach_suffix
    )

    return prefix + updated_block + suffix


def main() -> None:
    for path in (MESSAGE_JS, RULES_FILE):
        if not path.exists():
            fail(f"Missing file: {path.relative_to(ROOT)}")

    original_js = MESSAGE_JS.read_text(encoding="utf-8")
    original_rules = RULES_FILE.read_text(encoding="utf-8")

    updated_js = patch_message_js(original_js)
    updated_rules = patch_rules(original_rules)

    if updated_js == original_js and updated_rules == original_rules:
        print("✅ Admin → Location Manager funnel already installed.")
        return

    backup(MESSAGE_JS)
    backup(RULES_FILE)

    MESSAGE_JS.write_text(updated_js, encoding="utf-8")
    RULES_FILE.write_text(updated_rules, encoding="utf-8")

    print()
    print("✅ Funnel updated:")
    print("   PUBLIC")
    print("   → ADMIN_REVIEW")
    print("   → MANAGEMENT_TRIAGE")
    print("   → LOCATION_MANAGER")
    print("   → COACH_ASSIGNED")
    print()
    print("Next verification:")
    print("  node --check public/connect/message.js")
    print("  firebase deploy --only firestore:rules --dry-run")
    print("  git diff --check")
    print(
        "  git diff --stat -- "
        "firestore.rules public/connect/message.js"
    )


if __name__ == "__main__":
    main()
