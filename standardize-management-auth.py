#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
MANAGEMENT = PUBLIC / "management"

GUARD_FILE = (
    MANAGEMENT
    / "shared"
    / "guards"
    / "management-guard.js"
)

HUB_JS_FILE = MANAGEMENT / "hub" / "management.js"
RULES_FILE = ROOT / "firestore.rules"

DUPLICATE_YESC_HUB = (
    MANAGEMENT
    / "organizations"
    / "yesc"
    / "hub"
)

LEGACY = MANAGEMENT / "_legacy"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


GUARD_CONTENT = """\
import {
  auth,
  db,
  doc,
  getDoc
} from "/assets/js/firebase-init.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";


const MANAGEMENT_ROLES = new Set([
  "management",
  "manager",
  "location_manager"
]);


function clean(value) {
  return String(value ?? "").trim();
}


function normalizeList(...values) {
  const result = [];

  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const cleaned = clean(item);

        if (
          cleaned &&
          !result.includes(cleaned)
        ) {
          result.push(cleaned);
        }
      }

      continue;
    }

    const cleaned = clean(value);

    if (
      cleaned &&
      !result.includes(cleaned)
    ) {
      result.push(cleaned);
    }
  }

  return result;
}


function waitForAuthUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        unsubscribe();
        resolve(user);
      },
      (error) => {
        unsubscribe();
        reject(error);
      }
    );
  });
}


export function managementLoginUrl() {
  const returnUrl =
    window.location.pathname +
    window.location.search;

  return (
    "/management/auth/?returnUrl=" +
    encodeURIComponent(returnUrl)
  );
}


export async function requireManagement() {
  const user =
    auth.currentUser ||
    await waitForAuthUser();

  if (!user || user.isAnonymous) {
    throw new Error(
      "Management authentication required."
    );
  }

  const staffRef = doc(
    db,
    "staff",
    user.uid
  );

  const staffSnapshot =
    await getDoc(staffRef);

  if (!staffSnapshot.exists()) {
    throw new Error(
      "No staff profile found."
    );
  }

  const staff = staffSnapshot.data();

  const role =
    clean(staff.role).toLowerCase();

  const status =
    clean(staff.status).toLowerCase();

  const isSystemAdmin =
    role === "admin";

  const isManagement =
    MANAGEMENT_ROLES.has(role);

  if (!isSystemAdmin && !isManagement) {
    throw new Error(
      "Management access required."
    );
  }

  if (status !== "active") {
    throw new Error(
      "Management profile is not active."
    );
  }

  const organizationIds = normalizeList(
    staff.organizationIds,
    staff.organizationId
  );

  const academyIds = normalizeList(
    staff.academyIds,
    staff.academyId
  );

  const locationIds = normalizeList(
    staff.locationIds,
    staff.locations,
    staff.locationId
  );

  const programIds = normalizeList(
    staff.programIds,
    staff.programs,
    staff.programId
  );

  return {
    user,

    staff: {
      id: staffSnapshot.id,
      ...staff
    },

    role,
    isSystemAdmin,
    isManagement,

    scope: {
      organizationIds,
      academyIds,
      locationIds,
      programIds
    }
  };
}
"""


HUB_CONTENT = """\
import {
  auth
} from "/assets/js/firebase-init.js";

import {
  signOut
} from "https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js";

import {
  managementLoginUrl,
  requireManagement
} from "/management/shared/guards/management-guard.js";


const managerIdentity =
  document.getElementById("managerIdentity");

const locationScope =
  document.getElementById("locationScope");

const programScope =
  document.getElementById("programScope");

const accessScope =
  document.getElementById("accessScope");

const statusEl =
  document.getElementById("status");

const signOutBtn =
  document.getElementById("signOutBtn");


function clean(value) {
  return String(value ?? "").trim();
}


function setStatus(
  message = "",
  isError = false
) {
  if (!statusEl) return;

  statusEl.textContent = message;

  statusEl.classList.toggle(
    "error",
    isError
  );
}


function formatScope(
  values,
  fallback
) {
  if (
    Array.isArray(values) &&
    values.length
  ) {
    return values.join(", ");
  }

  return fallback;
}


function displayName(context) {
  return (
    clean(context.staff.fullName) ||
    clean(context.staff.displayName) ||
    clean(context.user.email) ||
    "Approved Management Account"
  );
}


function renderManagementContext(context) {
  managerIdentity.textContent =
    `${displayName(context)} — ${
      context.user.email || "Authenticated"
    }`;

  if (context.isSystemAdmin) {
    locationScope.textContent =
      "All locations";

    programScope.textContent =
      "All programs";

    accessScope.textContent =
      "System Admin Oversight";

    setStatus(
      "System Admin oversight access verified."
    );

    return;
  }

  locationScope.textContent =
    formatScope(
      context.scope.locationIds,
      "No location assignment"
    );

  programScope.textContent =
    formatScope(
      context.scope.programIds,
      "All assigned-location programs"
    );

  accessScope.textContent =
    "Operational Management";

  setStatus(
    "Management access verified."
  );
}


async function startManagementHub() {
  try {
    const context =
      await requireManagement();

    renderManagementContext(context);

    console.log(
      "[management-hub] access granted:",
      {
        uid: context.user.uid,
        email: context.user.email,
        role: context.role,
        scope: context.scope
      }
    );

  } catch (error) {
    console.error(
      "[management-hub] access denied:",
      error
    );

    setStatus(
      error?.message ||
      "Management access could not be verified.",
      true
    );

    const noAuthenticatedUser =
      !auth.currentUser ||
      auth.currentUser.isAnonymous;

    window.setTimeout(
      () => {
        window.location.replace(
          noAuthenticatedUser
            ? managementLoginUrl()
            : "/login/"
        );
      },
      1200
    );
  }
}


signOutBtn?.addEventListener(
  "click",
  async () => {
    await signOut(auth);

    window.location.replace(
      "/login/"
    );
  }
);


void startManagementHub();
"""


OLD_RULE_HELPERS = """\
    function isAdmin() {
      return staffRole() == "admin";
    }

    function isCoachOrAdmin() {
      return staffRole() in ["admin", "coach"];
    }
"""


NEW_RULE_HELPERS = """\
    function isAdmin() {
      return staffRole() == "admin";
    }

    function isManagement() {
      return staffRole() in [
        "management",
        "manager",
        "location_manager"
      ];
    }

    function isAdminOrManagement() {
      return isAdmin() || isManagement();
    }

    function isCoachOrAdmin() {
      return staffRole() in ["admin", "coach"];
    }

    function isOperationalStaff() {
      return staffRole() in [
        "admin",
        "management",
        "manager",
        "location_manager",
        "coach"
      ];
    }
"""


def backup(path: Path) -> Path:
    backup_path = path.with_name(
        f"{path.name}.before-management-auth-{STAMP}"
    )

    backup_path.write_text(
        path.read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    return backup_path


def write_guard() -> None:
    GUARD_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if GUARD_FILE.exists():
        backup_path = backup(GUARD_FILE)

        print(
            f"✓ Guard backup: "
            f"{backup_path.relative_to(ROOT)}"
        )

    GUARD_FILE.write_text(
        GUARD_CONTENT,
        encoding="utf-8",
    )

    print(
        f"✅ Written: "
        f"{GUARD_FILE.relative_to(ROOT)}"
    )


def replace_hub_js() -> None:
    if not HUB_JS_FILE.exists():
        raise FileNotFoundError(
            f"Management Hub JS missing: {HUB_JS_FILE}"
        )

    backup_path = backup(HUB_JS_FILE)

    HUB_JS_FILE.write_text(
        HUB_CONTENT,
        encoding="utf-8",
    )

    print(
        f"✅ Replaced: "
        f"{HUB_JS_FILE.relative_to(ROOT)}"
    )

    print(
        f"   Backup: "
        f"{backup_path.relative_to(ROOT)}"
    )


def patch_rules() -> None:
    if not RULES_FILE.exists():
        raise FileNotFoundError(
            f"Rules file missing: {RULES_FILE}"
        )

    text = RULES_FILE.read_text(
        encoding="utf-8"
    )

    if NEW_RULE_HELPERS in text:
        print(
            "✓ Firestore Management helpers "
            "already installed"
        )
        return

    count = text.count(OLD_RULE_HELPERS)

    if count != 1:
        raise RuntimeError(
            "Could not safely locate the existing "
            "Firestore role-helper block."
        )

    backup_path = backup(RULES_FILE)

    updated = text.replace(
        OLD_RULE_HELPERS,
        NEW_RULE_HELPERS,
        1,
    )

    RULES_FILE.write_text(
        updated,
        encoding="utf-8",
    )

    print("✅ Added Firestore Management helpers")
    print(
        f"   Backup: "
        f"{backup_path.relative_to(ROOT)}"
    )


def archive_duplicate_yesc_hub() -> None:
    if not DUPLICATE_YESC_HUB.exists():
        print(
            "✓ No duplicate organization-specific "
            "YESC Hub exists"
        )
        return

    LEGACY.mkdir(
        parents=True,
        exist_ok=True,
    )

    destination = (
        LEGACY
        / f"yesc-hub-copy-{STAMP}"
    )

    shutil.move(
        str(DUPLICATE_YESC_HUB),
        str(destination),
    )

    print(
        "✅ Archived duplicate YESC Hub copy:"
    )

    print(
        f"   {destination.relative_to(ROOT)}"
    )


def main() -> int:
    try:
        write_guard()
        replace_hub_js()
        patch_rules()
        archive_duplicate_yesc_hub()

    except Exception as error:
        print(
            f"❌ {error}",
            file=sys.stderr,
        )
        return 1

    print()
    print(
        "✅ Management authorization standardized."
    )

    print()
    print("Canonical Management home:")
    print("  /management/hub/")

    print()
    print("Authorization source:")
    print("  Firebase Auth UID")
    print("  → staff/{uid}")
    print("  → role + status + operational scope")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
