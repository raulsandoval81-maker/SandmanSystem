#!/usr/bin/env python3

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import difflib
import re
import shutil
import sys


ROOT = Path(__file__).resolve().parent

MESSAGE_JS = ROOT / "public/connect/message.js"
FIRESTORE_RULES = ROOT / "firestore.rules"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def fail(message: str) -> None:
    print(f"\n❌ {message}")
    sys.exit(1)


def backup(path: Path) -> Path:
    backup_path = path.with_name(f"{path.name}.before-general-funnel-{STAMP}")
    shutil.copy2(path, backup_path)
    print(f"🛟 Backup: {backup_path.relative_to(ROOT)}")
    return backup_path


def show_diff(path: Path, before: str, after: str) -> None:
    diff = difflib.unified_diff(
        before.splitlines(),
        after.splitlines(),
        fromfile=f"{path.relative_to(ROOT)} before",
        tofile=f"{path.relative_to(ROOT)} after",
        lineterm="",
    )

    print(f"\n--- Diff: {path.relative_to(ROOT)} ---")
    output = "\n".join(diff)
    print(output if output else "(no changes)")


def patch_message_js(text: str) -> str:
    if 'routingStage: "ADMIN_REVIEW"' in text:
        print("ℹ️  message.js already contains the routing schema.")
        return text

    pattern = re.compile(
        r'(?P<indent>[ \t]*)assignedCoachUid:\s*null,\s*\n'
        r'(?P=indent)assignedManagerUid:\s*null,\s*\n'
        r'(?P=indent)coachNotes:\s*"",\s*\n'
        r'(?P=indent)managementNotes:\s*"",'
    )

    match = pattern.search(text)

    if not match:
        fail(
            "Could not find the assignment/notes block in "
            "public/connect/message.js. Nothing was changed."
        )

    indent = match.group("indent")

    replacement = f'''{indent}routingStage: "ADMIN_REVIEW",
{indent}assignmentStatus: "UNASSIGNED",

{indent}locationId: null,
{indent}locationName: "",

{indent}assignedAdminUid: null,
{indent}assignedManagerUid: null,
{indent}assignedCoachUid: null,

{indent}respondedByUid: null,
{indent}respondedByRole: null,
{indent}respondedAt: null,

{indent}closedByUid: null,
{indent}closedAt: null,

{indent}escalated: false,
{indent}escalationReason: "",

{indent}coachNotes: "",
{indent}managementNotes: "",'''

    return text[:match.start()] + replacement + text[match.end():]


GENERAL_MESSAGES_RULES = r'''
    /* --------------------------------------
       General Messages Funnel
       Public → Admin → Management → Coach

       Collection:
       general_messages/{messageId}

       Current staff helper support:
       admin + coach

       Future:
       management and location scoping can be
       added without migrating existing records.
    ---------------------------------------*/
    match /general_messages/{messageId} {

      /*
       * Public Message Us submission.
       *
       * Every message enters at the organization level.
       * It is not born as a coach-owned message.
       */
      allow create: if request.auth != null

        && request.resource.data.keys().hasOnly([
          "organization",
          "pipeline",
          "source",

          "status",
          "messageStatus",
          "routingStage",
          "assignmentStatus",

          "contactName",
          "email",
          "phone",
          "topic",
          "message",
          "contactConsent",
          "language",
          "pagePath",

          "locationId",
          "locationName",

          "assignedAdminUid",
          "assignedManagerUid",
          "assignedCoachUid",

          "respondedByUid",
          "respondedByRole",
          "respondedAt",

          "closedByUid",
          "closedAt",

          "escalated",
          "escalationReason",

          "coachNotes",
          "managementNotes",

          "createdAt",
          "updatedAt"
        ])

        && request.resource.data.organization == "sandman-academy"
        && request.resource.data.pipeline == "general-messaging"
        && request.resource.data.source == "public-message-page"

        && request.resource.data.status == "NEW"
        && request.resource.data.messageStatus == "NEW"
        && request.resource.data.routingStage == "ADMIN_REVIEW"
        && request.resource.data.assignmentStatus == "UNASSIGNED"

        && request.resource.data.contactName is string
        && request.resource.data.contactName.size() > 0
        && request.resource.data.contactName.size() <= 120

        && request.resource.data.email is string
        && request.resource.data.email.size() > 3
        && request.resource.data.email.size() <= 254

        && request.resource.data.phone is string
        && request.resource.data.phone.size() <= 40

        && request.resource.data.topic is string
        && request.resource.data.topic.size() > 0
        && request.resource.data.topic.size() <= 120

        && request.resource.data.message is string
        && request.resource.data.message.size() > 0
        && request.resource.data.message.size() <= 4000

        && request.resource.data.contactConsent == true
        && request.resource.data.language in ["en", "es"]

        && request.resource.data.locationId == null
        && request.resource.data.locationName == ""

        && request.resource.data.assignedAdminUid == null
        && request.resource.data.assignedManagerUid == null
        && request.resource.data.assignedCoachUid == null

        && request.resource.data.respondedByUid == null
        && request.resource.data.respondedByRole == null
        && request.resource.data.respondedAt == null

        && request.resource.data.closedByUid == null
        && request.resource.data.closedAt == null

        && request.resource.data.escalated == false
        && request.resource.data.escalationReason == ""

        && request.resource.data.coachNotes == ""
        && request.resource.data.managementNotes == ""

        && request.resource.data.createdAt is timestamp
        && request.resource.data.updatedAt is timestamp;

      /*
       * Temporary operational visibility.
       *
       * Admin and Coach can currently read the inbox.
       * Management/location scoping will replace this
       * after the real staff-role values are verified.
       */
      allow get, list: if isCoachOrAdmin();

      /*
       * Admin owns routing and assignment.
       */
      allow update: if isAdmin()

        && request.resource.data.diff(resource.data)
          .changedKeys()
          .hasOnly([
            "status",
            "messageStatus",
            "routingStage",
            "assignmentStatus",

            "locationId",
            "locationName",

            "assignedAdminUid",
            "assignedManagerUid",
            "assignedCoachUid",

            "respondedByUid",
            "respondedByRole",
            "respondedAt",

            "closedByUid",
            "closedAt",

            "escalated",
            "escalationReason",

            "coachNotes",
            "managementNotes",
            "updatedAt"
          ])

        && request.resource.data.status in [
          "NEW",
          "TRIAGE",
          "ASSIGNED",
          "REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]

        && request.resource.data.messageStatus ==
           request.resource.data.status

        && request.resource.data.routingStage in [
          "ADMIN_REVIEW",
          "MANAGEMENT_TRIAGE",
          "COACH_ASSIGNED",
          "COACH_REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]

        && request.resource.data.assignmentStatus in [
          "UNASSIGNED",
          "PENDING_MANAGEMENT",
          "PENDING_COACH",
          "ASSIGNED",
          "COMPLETED"
        ]

        && request.resource.data.coachNotes is string
        && request.resource.data.coachNotes.size() <= 4000

        && request.resource.data.managementNotes is string
        && request.resource.data.managementNotes.size() <= 4000

        && request.resource.data.escalated is bool
        && request.resource.data.escalationReason is string
        && request.resource.data.escalationReason.size() <= 1000

        && request.resource.data.updatedAt is timestamp;

      /*
       * Current Coach inbox behavior.
       *
       * Coaches may update response workflow fields,
       * but may not assign locations, managers, coaches,
       * or rewrite the original public message.
       */
      allow update: if staffRole() == "coach"

        && request.resource.data.diff(resource.data)
          .changedKeys()
          .hasOnly([
            "status",
            "messageStatus",
            "routingStage",
            "assignmentStatus",

            "coachNotes",

            "respondedByUid",
            "respondedByRole",
            "respondedAt",

            "closedByUid",
            "closedAt",

            "escalated",
            "escalationReason",
            "updatedAt"
          ])

        && request.resource.data.status in [
          "NEW",
          "REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]

        && request.resource.data.messageStatus ==
           request.resource.data.status

        && request.resource.data.routingStage in [
          "ADMIN_REVIEW",
          "COACH_ASSIGNED",
          "COACH_REVIEWING",
          "RESPONDED",
          "CLOSED"
        ]

        && request.resource.data.assignmentStatus in [
          "UNASSIGNED",
          "ASSIGNED",
          "COMPLETED"
        ]

        && request.resource.data.coachNotes is string
        && request.resource.data.coachNotes.size() <= 4000

        && request.resource.data.escalated is bool
        && request.resource.data.escalationReason is string
        && request.resource.data.escalationReason.size() <= 1000

        && request.resource.data.updatedAt is timestamp;

      allow delete: if isAdmin();

      /*
       * Immutable history will eventually be written
       * through trusted Cloud Functions.
       */
      match /history/{historyId} {
        allow get, list: if isCoachOrAdmin();
        allow create, update, delete: if false;
      }
    }

'''


def patch_firestore_rules(text: str) -> str:
    if "match /general_messages/{messageId}" in text:
        print("ℹ️  firestore.rules already contains general_messages.")
        return text

    marker = """    /* --------------------------------------
       DEFAULT CLOSED
    ---------------------------------------*/"""

    if marker not in text:
        fail(
            "Could not find the DEFAULT CLOSED marker in firestore.rules. "
            "Nothing was changed."
        )

    return text.replace(marker, GENERAL_MESSAGES_RULES + marker, 1)


def main() -> None:
    for path in (MESSAGE_JS, FIRESTORE_RULES):
        if not path.exists():
            fail(f"Missing required file: {path.relative_to(ROOT)}")

    original_message_js = MESSAGE_JS.read_text(encoding="utf-8")
    original_rules = FIRESTORE_RULES.read_text(encoding="utf-8")

    updated_message_js = patch_message_js(original_message_js)
    updated_rules = patch_firestore_rules(original_rules)

    if (
        updated_message_js == original_message_js
        and updated_rules == original_rules
    ):
        print("\n✅ Funnel schema is already installed. No files changed.")
        return

    backup(MESSAGE_JS)
    backup(FIRESTORE_RULES)

    MESSAGE_JS.write_text(updated_message_js, encoding="utf-8")
    FIRESTORE_RULES.write_text(updated_rules, encoding="utf-8")

    show_diff(MESSAGE_JS, original_message_js, updated_message_js)
    show_diff(FIRESTORE_RULES, original_rules, updated_rules)

    print("\n✅ General Messages funnel patched.")
    print("\nNext verification commands:")
    print("  node --check public/connect/message.js")
    print("  firebase deploy --only firestore:rules --dry-run")
    print("  git diff --check")
    print("  git status --short")


if __name__ == "__main__":
    main()
