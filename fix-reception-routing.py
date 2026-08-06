#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parent

RECEPTION_FILE = ROOT / "public/admin/reception/reception.js"
RULES_FILE = ROOT / "firestore.rules"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def backup(path: Path) -> Path:
    backup_path = path.with_name(
        f"{path.name}.before-routing-fix-{STAMP}"
    )

    backup_path.write_text(
        path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    return backup_path


def patch_reception() -> None:
    text = RECEPTION_FILE.read_text(encoding="utf-8")

    pattern = re.compile(
        r'''
        routingStage:\s*managerUid\s*
        \?\s*"LOCATION_MANAGER"\s*
        :\s*"MANAGEMENT_TRIAGE",\s*

        nextRoutingStage:\s*managerUid\s*
        \?\s*"COACH_REVIEW"\s*
        :\s*"LOCATION_MANAGER",\s*

        assignmentStatus:\s*managerUid\s*
        \?\s*"ASSIGNED"\s*
        :\s*"NEEDS_MANAGER",
        ''',
        re.VERBOSE,
    )

    replacement = '''\
routingStage: "MANAGEMENT_TRIAGE",

      nextRoutingStage: "COACH_ASSIGNED",

      assignmentStatus: managerUid
        ? "ASSIGNED"
        : "PENDING_MANAGEMENT",'''

    updated, count = pattern.subn(
        replacement,
        text,
        count=1,
    )

    if count == 0:
        if (
            'routingStage: "MANAGEMENT_TRIAGE"' in text
            and 'nextRoutingStage: "COACH_ASSIGNED"' in text
            and '"PENDING_MANAGEMENT"' in text
        ):
            print("✓ Reception routing already patched")
            return

        raise RuntimeError(
            "Could not locate the Reception routing state block."
        )

    backup_path = backup(RECEPTION_FILE)

    RECEPTION_FILE.write_text(
        updated,
        encoding="utf-8",
    )

    print(
        f"✅ Patched: {RECEPTION_FILE.relative_to(ROOT)}"
    )
    print(
        f"   Backup: {backup_path.relative_to(ROOT)}"
    )


def patch_rules() -> None:
    text = RULES_FILE.read_text(encoding="utf-8")

    pattern = re.compile(
        r'''
        &&\s*request\.resource\.data\.assignedManagerUid
        \s+is\s+string\s*

        &&\s*request\.resource\.data\.assignedManagerUid
        \s*\.size\(\)\s*>\s*0\s*

        &&\s*request\.resource\.data\.assignedCoachUid
        \s*==\s*null
        ''',
        re.VERBOSE,
    )

    replacement = '''\
&& (
              request.resource.data.assignedManagerUid == null
              ||
              (
                request.resource.data.assignedManagerUid is string
                && request.resource.data.assignedManagerUid.size() > 0
              )
            )

            && (
              (
                request.resource.data.assignedManagerUid == null
                && request.resource.data.assignmentStatus ==
                  "PENDING_MANAGEMENT"
              )
              ||
              (
                request.resource.data.assignedManagerUid is string
                && request.resource.data.assignedManagerUid.size() > 0
                && request.resource.data.assignmentStatus ==
                  "ASSIGNED"
              )
            )

            && request.resource.data.assignedCoachUid == null'''

    updated, count = pattern.subn(
        replacement,
        text,
        count=1,
    )

    if count == 0:
        if (
            "assignedManagerUid == null" in text
            and '"PENDING_MANAGEMENT"' in text
        ):
            print("✓ Firestore rule already patched")
            return

        raise RuntimeError(
            "Could not locate the assigned-manager requirement."
        )

    backup_path = backup(RULES_FILE)

    RULES_FILE.write_text(
        updated,
        encoding="utf-8",
    )

    print(
        f"✅ Patched: {RULES_FILE.relative_to(ROOT)}"
    )
    print(
        f"   Backup: {backup_path.relative_to(ROOT)}"
    )


def main() -> int:
    try:
        patch_reception()
        patch_rules()
    except Exception as error:
        print(f"❌ {error}", file=sys.stderr)
        return 1

    print()
    print("✅ Reception and Firestore routing are aligned.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
