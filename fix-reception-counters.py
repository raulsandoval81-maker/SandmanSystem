#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent
FILE = ROOT / "public/admin/reception/reception.js"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


NEW_FUNCTION = r'''function updateSummary() {
  const counts = {
    new: 0,
    needsRouting: 0,
    assigned: 0,
    waiting: 0,
    closed: 0
  };

  for (const message of allMessages) {
    const status = messageStatus(message);
    const stage = routingStage(message);
    const assignment = assignmentStatus(message);

    if (
      status === "CLOSED" ||
      stage === "CLOSED" ||
      message.closedAt
    ) {
      counts.closed += 1;
      continue;
    }

    if (
      status === "WAITING" ||
      status === "WAITING_FOR_RESPONSE"
    ) {
      counts.waiting += 1;
    }

    /*
     * New means the message is still waiting for
     * System Admin review.
     */
    if (stage === "ADMIN_REVIEW") {
      counts.new += 1;
    }

    /*
     * Needs Routing means Admin has not yet selected
     * both an organization and a location.
     *
     * MANAGEMENT_TRIAGE is no longer counted here,
     * because that message has already been routed.
     */
    if (
      !clean(message.organizationId) ||
      !clean(message.locationId)
    ) {
      counts.needsRouting += 1;
    }

    /*
     * Assigned means a specific manager UID exists.
     * Merely entering MANAGEMENT_TRIAGE does not mean
     * a manager has been assigned yet.
     */
    if (
      assignment === "ASSIGNED" &&
      Boolean(clean(message.assignedManagerUid))
    ) {
      counts.assigned += 1;
    }
  }

  newMessageCount.textContent =
    String(counts.new);

  needsRoutingCount.textContent =
    String(counts.needsRouting);

  assignedMessageCount.textContent =
    String(counts.assigned);

  waitingMessageCount.textContent =
    String(counts.waiting);

  closedMessageCount.textContent =
    String(counts.closed);
}'''


def main() -> int:
    if not FILE.exists():
        print(f"❌ File not found: {FILE}", file=sys.stderr)
        return 1

    text = FILE.read_text(encoding="utf-8")

    pattern = re.compile(
        r"function updateSummary\(\) \{.*?\n\}",
        re.DOTALL,
    )

    matches = list(pattern.finditer(text))

    if len(matches) != 1:
        print(
            f"❌ Expected one updateSummary() function, found {len(matches)}.",
            file=sys.stderr,
        )
        return 1

    backup = FILE.with_name(
        f"{FILE.name}.before-counter-fix-{STAMP}"
    )

    backup.write_text(text, encoding="utf-8")

    updated = pattern.sub(NEW_FUNCTION, text, count=1)

    FILE.write_text(updated, encoding="utf-8")

    print(f"✅ Patched: {FILE.relative_to(ROOT)}")
    print(f"✅ Backup: {backup.relative_to(ROOT)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
