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


def backup(path: Path) -> Path:
    target = path.with_name(
        f"{path.name}.before-org-academy-routing-{STAMP}"
    )
    shutil.copy2(path, target)
    print(f"🛟 Backup: {target.relative_to(ROOT)}")
    return target


def replace_once(
    text: str,
    old: str,
    new: str,
    label: str,
) -> str:
    count = text.count(old)

    if count != 1:
        fail(
            f"{label}: expected exactly one match, "
            f"found {count}. No files changed."
        )

    return text.replace(old, new, 1)


def get_general_messages_block(
    text: str,
) -> tuple[str, str, str]:
    start_marker = "    match /general_messages/{messageId} {"
    end_marker = (
        "    /* --------------------------------------\n"
        "       DEFAULT CLOSED"
    )

    start = text.find(start_marker)
    if start == -1:
        fail("general_messages rules block was not found.")

    end = text.find(end_marker, start)
    if end == -1:
        fail("DEFAULT CLOSED marker was not found.")

    return text[:start], text[start:end], text[end:]


def patch_message_js(text: str) -> str:
    if "organizationId: null" in text:
        print("ℹ️  message.js already has organization routing fields.")
        return text

    old = '''      routingStage: "ADMIN_REVIEW",
      nextRoutingStage: "MANAGEMENT_TRIAGE",
      routingPolicy: "ADMIN_TO_LOCATION_MANAGER",
      requiredManagerLevel: "LOCATION_MANAGER",
      assignmentStatus: "UNASSIGNED",

      locationId: null,
      locationName: "",
'''

    new = '''      routingStage: "ADMIN_REVIEW",
      nextRoutingStage: "MANAGEMENT_TRIAGE",
      routingPolicy: "ADMIN_TO_ORGANIZATION_LOCATION_MANAGER",
      requiredManagerLevel: "LOCATION_MANAGER",
      assignmentStatus: "UNASSIGNED",

      organizationId: null,
      organizationName: "",

      academyId: null,
      academyName: "",

      locationId: null,
      locationName: "",
'''

    return replace_once(
        text,
        old,
        new,
        "message.js routing defaults",
    )


def patch_rules(text: str) -> str:
    prefix, block, suffix = get_general_messages_block(text)

    if '"organizationId",' not in block:
        old = '''          "locationId",
          "locationName",
'''

        new = '''          "organizationId",
          "organizationName",

          "academyId",
          "academyName",

          "locationId",
          "locationName",
'''

        block = replace_once(
            block,
            old,
            new,
            "create allowed routing fields",
        )

    if (
        'request.resource.data.organizationId == null'
        not in block
    ):
        old = '''        && request.resource.data.locationId == null
        && request.resource.data.locationName == ""
'''

        new = '''        && request.resource.data.organizationId == null
        && request.resource.data.organizationName == ""

        && request.resource.data.academyId == null
        && request.resource.data.academyName == ""

        && request.resource.data.locationId == null
        && request.resource.data.locationName == ""
'''

        block = replace_once(
            block,
            old,
            new,
            "create default routing validation",
        )

    block = block.replace(
        '"ADMIN_TO_LOCATION_MANAGER"',
        '"ADMIN_TO_ORGANIZATION_LOCATION_MANAGER"',
    )

    admin_start = block.find(
        "      allow update: if isAdmin()"
    )
    coach_start = block.find(
        '      allow update: if staffRole() == "coach"'
    )

    if admin_start == -1 or coach_start == -1:
        fail("Could not isolate Admin and Coach update rules.")

    admin_section = block[admin_start:coach_start]

    if '"organizationId",' not in admin_section:
        old = '''            "locationId",
            "locationName",
'''

        new = '''            "organizationId",
            "organizationName",

            "academyId",
            "academyName",

            "locationId",
            "locationName",
'''

        admin_section = replace_once(
            admin_section,
            old,
            new,
            "Admin update routing fields",
        )

    if "Organization and location are both required" not in admin_section:
        old = '''            && request.resource.data.locationId is string
            && request.resource.data.locationId.size() > 0

            && request.resource.data.locationName is string
            && request.resource.data.locationName.size() > 0
'''

        new = '''            /*
             * Organization and location are both required.
             * Academy is optional because YESC or another
             * organization may route directly to a location.
             */
            && request.resource.data.organizationId is string
            && request.resource.data.organizationId.size() > 0

            && request.resource.data.organizationName is string
            && request.resource.data.organizationName.size() > 0

            && (
              (
                request.resource.data.academyId == null
                && request.resource.data.academyName == ""
              )
              ||
              (
                request.resource.data.academyId is string
                && request.resource.data.academyId.size() > 0
                && request.resource.data.academyName is string
                && request.resource.data.academyName.size() > 0
              )
            )

            && request.resource.data.locationId is string
            && request.resource.data.locationId.size() > 0

            && request.resource.data.locationName is string
            && request.resource.data.locationName.size() > 0
'''

        admin_section = replace_once(
            admin_section,
            old,
            new,
            "Admin routing-scope requirement",
        )

    block = (
        block[:admin_start]
        + admin_section
        + block[coach_start:]
    )

    return prefix + block + suffix


def main() -> None:
    for path in (MESSAGE_JS, RULES_FILE):
        if not path.exists():
            fail(f"Missing file: {path.relative_to(ROOT)}")

    original_js = MESSAGE_JS.read_text(encoding="utf-8")
    original_rules = RULES_FILE.read_text(encoding="utf-8")

    updated_js = patch_message_js(original_js)
    updated_rules = patch_rules(original_rules)

    if (
        updated_js == original_js
        and updated_rules == original_rules
    ):
        print("✅ Organization and academy routing already installed.")
        return

    backup(MESSAGE_JS)
    backup(RULES_FILE)

    MESSAGE_JS.write_text(updated_js, encoding="utf-8")
    RULES_FILE.write_text(updated_rules, encoding="utf-8")

    print()
    print("✅ Routing scope updated:")
    print()
    print("   SYSTEM ADMIN")
    print("   → ORGANIZATION / ACADEMY")
    print("   → LOCATION MANAGER")
    print("   → COACH WHEN NEEDED")
    print()
    print("Examples:")
    print("   YESC → YESC location manager")
    print("   Sandman Academy → Headquarters manager")
    print("   Partner academy → partner location manager")
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
