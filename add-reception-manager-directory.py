#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parent
JS_FILE = ROOT / "public/admin/reception/reception.js"
RULES_FILE = ROOT / "firestore.rules"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def backup(path: Path) -> Path:
    backup_path = path.with_name(
        f"{path.name}.before-manager-directory-{STAMP}"
    )
    backup_path.write_text(
        path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    return backup_path


def replace_once(
    text: str,
    old: str,
    new: str,
    label: str,
) -> str:
    count = text.count(old)

    if count == 0:
        if new in text:
            print(f"✓ Already patched: {label}")
            return text

        raise RuntimeError(
            f"Expected block not found: {label}"
        )

    if count != 1:
        raise RuntimeError(
            f"Found {count} copies of {label}; refusing patch."
        )

    return text.replace(old, new, 1)


def patch_reception() -> None:
    text = JS_FILE.read_text(encoding="utf-8")
    original = text

    text = replace_once(
        text,
        """let adminUser = null;
let allMessages = [];
let selectedMessage = null;""",
        """let adminUser = null;
let allMessages = [];
let selectedMessage = null;
let managerDirectory = [];""",
        "Reception state",
    )

    old_prepare = """function prepareManagerField(message) {
  routingManager.replaceChildren();

  const option = document.createElement("option");

  const assignedUid =
    clean(message.assignedManagerUid);

  if (assignedUid) {
    option.value = assignedUid;
    option.textContent =
      `Assigned Manager (${assignedUid})`;
  } else {
    option.value = "UNASSIGNED";
    option.textContent =
      "Assign manager from management queue";
  }

  routingManager.appendChild(option);

  /*
   * Manager-directory integration comes next.
   * Until then, Reception sends the message into the
   * correct organization/location management queue.
   */
  routingManager.required = false;
  routeMessageButton.textContent =
    assignedUid
      ? "Update Routing"
      : "Send to Management Queue";
}"""

    new_prepare = """async function loadManagerDirectory() {
  const snapshot = await getDocs(
    collection(db, "staff")
  );

  managerDirectory = snapshot.docs
    .map((staffDoc) => ({
      id: staffDoc.id,
      ...staffDoc.data()
    }))
    .filter((staff) => {
      const role = clean(staff.role).toLowerCase();
      const status = clean(staff.status).toLowerCase();

      return (
        status === "active" &&
        [
          "management",
          "manager",
          "location_manager"
        ].includes(role)
      );
    })
    .sort((a, b) => {
      const nameA = clean(
        a.fullName || a.displayName || a.email
      );

      const nameB = clean(
        b.fullName || b.displayName || b.email
      );

      return nameA.localeCompare(nameB);
    });
}

function prepareManagerField(message) {
  routingManager.replaceChildren();

  const queueOption =
    document.createElement("option");

  queueOption.value = "UNASSIGNED";
  queueOption.textContent =
    "Send to location management queue";

  routingManager.appendChild(queueOption);

  for (const manager of managerDirectory) {
    const option =
      document.createElement("option");

    option.value = manager.id;

    const name = clean(
      manager.fullName ||
      manager.displayName ||
      manager.email ||
      manager.id
    );

    const email = clean(manager.email);

    option.textContent = email && email !== name
      ? `${name} — ${email}`
      : name;

    routingManager.appendChild(option);
  }

  const assignedUid =
    clean(message.assignedManagerUid);

  const assignedExists =
    assignedUid &&
    managerDirectory.some(
      (manager) => manager.id === assignedUid
    );

  if (assignedExists) {
    routingManager.value = assignedUid;
  } else {
    routingManager.value = "UNASSIGNED";
  }

  routingManager.required = false;

  routeMessageButton.textContent =
    assignedExists
      ? "Update Routing"
      : "Send to Management Queue";
}"""

    text = replace_once(
        text,
        old_prepare,
        new_prepare,
        "Manager dropdown",
    )

    text = replace_once(
        text,
        '''assignmentStatus: "PENDING_MANAGEMENT",''',
        '''assignmentStatus: managerUid
        ? "ASSIGNED"
        : "PENDING_MANAGEMENT",''',
        "Manager assignment status",
    )

    text = replace_once(
        text,
        """    adminUser = await requireAdmin();

    const messagesQuery = query(""",
        """    adminUser = await requireAdmin();

    await loadManagerDirectory();

    const messagesQuery = query(""",
        "Manager-directory loading",
    )

    if text == original:
        print("✓ Reception already current")
        return

    backup_path = backup(JS_FILE)
    JS_FILE.write_text(text, encoding="utf-8")

    print(f"✅ Patched: {JS_FILE.relative_to(ROOT)}")
    print(f"   Backup: {backup_path.relative_to(ROOT)}")


def patch_rules() -> None:
    text = RULES_FILE.read_text(encoding="utf-8")
    original = text

    old_rule = '''            && request.resource.data.assignmentStatus ==
              "PENDING_MANAGEMENT"

            /*
             * Organization and location are both required.'''

    new_rule = '''            && request.resource.data.assignmentStatus in [
              "PENDING_MANAGEMENT",
              "ASSIGNED"
            ]

            /*
             * Organization and location are both required.'''

    text = replace_once(
        text,
        old_rule,
        new_rule,
        "First-handoff assignment state",
    )

    if text == original:
        print("✓ Firestore rules already current")
        return

    backup_path = backup(RULES_FILE)
    RULES_FILE.write_text(text, encoding="utf-8")

    print(f"✅ Patched: {RULES_FILE.relative_to(ROOT)}")
    print(f"   Backup: {backup_path.relative_to(ROOT)}")


def main() -> int:
    try:
        if not JS_FILE.exists():
            raise FileNotFoundError(JS_FILE)

        if not RULES_FILE.exists():
            raise FileNotFoundError(RULES_FILE)

        patch_reception()
        patch_rules()

    except Exception as error:
        print(f"❌ {error}", file=sys.stderr)
        return 1

    print()
    print("✅ Reception manager directory installed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
