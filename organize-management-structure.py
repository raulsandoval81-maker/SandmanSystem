#!/usr/bin/env python3

from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent
MANAGEMENT = ROOT / "public" / "management"


DIRECTORIES = [
    # Authentication and shared framework
    "auth",
    "shared",
    "shared/components",
    "shared/config",
    "shared/guards",
    "shared/services",

    # Shared operational modules
    "dashboard",
    "inbox",
    "admissions",
    "athletes",
    "coaches",
    "reports",

    # Organization-specific Management areas
    "organizations",
    "organizations/yesc",
    "organizations/yesc/dashboard",
    "organizations/yesc/inbox",
    "organizations/yesc/programs",
    "organizations/yesc/reports",

    "organizations/sandman-academy",
    "organizations/sandman-academy/dashboard",
    "organizations/sandman-academy/inbox",
    "organizations/sandman-academy/admissions",
    "organizations/sandman-academy/athletes",
    "organizations/sandman-academy/coaches",
    "organizations/sandman-academy/reports",

    # Location-specific configuration
    "locations",
    "locations/solvang",
    "locations/lompoc",
    "locations/system-team",

    # Preserve older structures until reviewed
    "_legacy",
]


FILES = {
    # Shared management framework
    "shared/config/organizations.js": """\
export const MANAGEMENT_ORGANIZATIONS = {
  yesc: {
    id: "yesc",
    name: "Youth Empowered Sports Club",
    defaultRoute: "/management/organizations/yesc/"
  },

  "sandman-academy": {
    id: "sandman-academy",
    name: "Sandman Academy of Combat & Fitness",
    defaultRoute:
      "/management/organizations/sandman-academy/"
  }
};
""",

    "shared/config/locations.js": """\
export const MANAGEMENT_LOCATIONS = {
  solvang: {
    id: "solvang",
    name: "Solvang"
  },

  lompoc: {
    id: "lompoc",
    name: "Lompoc"
  },

  "system-team": {
    id: "system-team",
    name: "System Team"
  }
};
""",

    "shared/services/management-context.js": """\
export function getManagementContext(staff = {}) {
  return {
    organizationId:
      staff.organizationId ||
      staff.academyId ||
      null,

    locationId:
      staff.locationId ||
      null,

    role:
      staff.role ||
      null
  };
}
""",

    # Organization landing files
    "organizations/yesc/index.html": """\
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>YESC Management</title>
</head>
<body>
  <main>
    <h1>Youth Empowered Sports Club</h1>
    <p>Management workspace.</p>
  </main>
</body>
</html>
""",

    "organizations/sandman-academy/index.html": """\
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  >
  <title>Sandman Academy Management</title>
</head>
<body>
  <main>
    <h1>Sandman Academy Management</h1>
    <p>Academy and location operations workspace.</p>
  </main>
</body>
</html>
""",

    # Location configuration
    "locations/solvang/location.js": """\
export const locationConfig = {
  id: "solvang",
  name: "Solvang",
  organizationId: "sandman-academy"
};
""",

    "locations/lompoc/location.js": """\
export const locationConfig = {
  id: "lompoc",
  name: "Lompoc",
  organizationId: "sandman-academy"
};
""",

    "locations/system-team/location.js": """\
export const locationConfig = {
  id: "system-team",
  name: "System Team",
  organizationId: null
};
""",
}


def create_directories() -> None:
    for relative_path in DIRECTORIES:
        directory = MANAGEMENT / relative_path
        directory.mkdir(parents=True, exist_ok=True)
        print(f"✓ Directory: {directory.relative_to(ROOT)}")


def create_files() -> None:
    for relative_path, content in FILES.items():
        path = MANAGEMENT / relative_path

        if path.exists():
            print(
                f"✓ Preserved existing file: "
                f"{path.relative_to(ROOT)}"
            )
            continue

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

        print(f"✅ Created: {path.relative_to(ROOT)}")


def copy_existing_yesc_hub() -> None:
    source = MANAGEMENT / "hub"
    destination = MANAGEMENT / "organizations" / "yesc" / "hub"

    if not source.exists():
        print("ℹ️ No existing Management hub found to copy.")
        return

    if destination.exists():
        print(
            "✓ Preserved existing YESC hub copy: "
            f"{destination.relative_to(ROOT)}"
        )
        return

    shutil.copytree(source, destination)

    print(
        "✅ Copied existing hub to: "
        f"{destination.relative_to(ROOT)}"
    )
    print(
        "   Original remains untouched at: "
        f"{source.relative_to(ROOT)}"
    )


def main() -> int:
    if not MANAGEMENT.exists():
        print(
            f"❌ Management directory not found: {MANAGEMENT}",
            file=sys.stderr,
        )
        return 1

    create_directories()
    create_files()
    copy_existing_yesc_hub()

    print()
    print("✅ Management structure organized.")
    print()
    print("Existing routes were not moved or deleted.")
    print("The original /management/hub/ remains intact.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
