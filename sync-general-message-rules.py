#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys


ROOT = Path(__file__).resolve().parent
RULES_FILE = ROOT / "firestore.rules"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


NEW_BLOCK = r'''    /* --------------------------------------
       General Messages Funnel
       Public → Admin → Management → Coach

       Collection:
       general_messages/{messageId}

       Management and location-specific access will be
       activated after the management role records and
       location assignments are finalized.
    ---------------------------------------*/
    match /general_messages/{messageId} {

      /*
       * Every public message enters at the organization
       * level for Admin review. It is not initially owned
       * by a coach or location.
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
       * Current visibility:
       * Admin sees all messages.
       * Coach visibility remains enabled for the working
       * receiver until assignment scoping is activated.
       */
      allow get, list: if isCoachOrAdmin();

      /*
       * Admin controls routing, assignment, location,
       * escalation, response metadata, and closure.
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
       * Current coach receiver behavior.
       *
       * Coaches cannot assign locations, managers,
       * coaches, or alter the original public message.
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
       * Reserved audit-history path.
       * Later, trusted Cloud Functions can write immutable
       * routing and assignment records here.
       */
      match /history/{historyId} {
        allow get, list: if isCoachOrAdmin();
        allow create, update, delete: if false;
      }
    }

'''


def fail(message: str) -> None:
    print(f"❌ {message}")
    sys.exit(1)


def main() -> None:
    if not RULES_FILE.exists():
        fail("firestore.rules was not found.")

    original = RULES_FILE.read_text(encoding="utf-8")

    pattern = re.compile(
        r'[ \t]*/\* -+\n'
        r'[ \t]*(?:Public General Messages|General Messages Funnel).*?'
        r'match /general_messages/\{messageId\} \{.*?'
        r'\n[ \t]*\}\n'
        r'(?=\n[ \t]*/\* -+\n[ \t]*DEFAULT CLOSED)',
        re.DOTALL,
    )

    matches = list(pattern.finditer(original))

    if len(matches) != 1:
        fail(
            "Expected exactly one general_messages block, "
            f"but found {len(matches)}. No changes made."
        )

    updated = pattern.sub(NEW_BLOCK.rstrip(), original, count=1)

    backup = RULES_FILE.with_name(
        f"firestore.rules.before-funnel-sync-{STAMP}"
    )
    shutil.copy2(RULES_FILE, backup)

    RULES_FILE.write_text(updated, encoding="utf-8")

    print(f"🛟 Backup: {backup.name}")
    print("✅ Replaced the existing general_messages rules block.")
    print()
    print("Next:")
    print("  firebase deploy --only firestore:rules --dry-run")
    print("  git diff --check")
    print("  git diff --stat -- firestore.rules public/connect/message.js")


if __name__ == "__main__":
    main()
