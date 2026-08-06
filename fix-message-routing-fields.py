#!/usr/bin/env python3

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys


ROOT = Path(__file__).resolve().parent
HTML_FILE = ROOT / "public/connect/message.html"
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def fail(message: str) -> None:
    print(f"❌ {message}")
    sys.exit(1)


def backup(path: Path) -> Path:
    target = path.with_name(
        f"{path.name}.before-routing-fields-{STAMP}"
    )
    shutil.copy2(path, target)
    print(f"🛟 Backup: {target.relative_to(ROOT)}")
    return target


ROUTING_FIELDS = '''            <div class="message-field">
              <label for="preferredOrganization">
                <span data-lang-block="en">
                  Organization You Are Trying to Reach
                </span>

                <span
                  data-lang-block="es"
                  class="hidden-lang"
                >
                  Organización con la que Deseas Comunicarte
                </span>
              </label>

              <select
                id="preferredOrganization"
                name="preferredOrganization"
                required
              >
                <option value="">
                  Choose one
                </option>

                <option value="sandman-academy">
                  Sandman Academy of Combat &amp; Fitness
                </option>

                <option value="yesc">
                  Youth Empowered Sports Club
                </option>

                <option value="other-organization">
                  Another Organization
                </option>

                <option value="not-sure">
                  Not Sure
                </option>
              </select>
            </div>

            <div class="message-field">
              <label for="preferredLocation">
                <span data-lang-block="en">
                  Location You Are Trying to Reach
                </span>

                <span
                  data-lang-block="es"
                  class="hidden-lang"
                >
                  Ubicación con la que Deseas Comunicarte
                </span>
              </label>

              <select
                id="preferredLocation"
                name="preferredLocation"
                required
              >
                <option value="">
                  Choose one
                </option>

                <option value="solvang">
                  Solvang Location
                </option>

                <option value="lompoc">
                  Lompoc Location
                </option>

                <option value="system-team">
                  System Team
                </option>

                <option value="not-sure">
                  Not Sure
                </option>
              </select>
            </div>
'''


def main() -> None:
    if not HTML_FILE.exists():
        fail("public/connect/message.html was not found.")

    original = HTML_FILE.read_text(encoding="utf-8")

    loose_location_pattern = re.compile(
        r'[ \t]*<select\s*\n'
        r'[ \t]*id="preferredLocation"\s*\n'
        r'[ \t]*name="preferredLocation"\s*\n'
        r'[ \t]*required\s*\n'
        r'[ \t]*>\s*'
        r'.*?'
        r'</select>\s*',
        re.DOTALL,
    )

    matches = list(loose_location_pattern.finditer(original))

    if len(matches) != 1:
        fail(
            "Expected exactly one loose preferredLocation select, "
            f"found {len(matches)}. No changes made."
        )

    if 'id="preferredOrganization"' in original:
        fail(
            "preferredOrganization already exists. "
            "No changes made to avoid duplication."
        )

    updated = loose_location_pattern.sub(
        ROUTING_FIELDS,
        original,
        count=1,
    )

    checks = {
        'id="preferredOrganization"': 1,
        'name="preferredOrganization"': 1,
        'id="preferredLocation"': 1,
        'name="preferredLocation"': 1,
    }

    for token, expected in checks.items():
        actual = updated.count(token)

        if actual != expected:
            fail(
                f"Validation failed for {token}: "
                f"expected {expected}, found {actual}."
            )

    backup(HTML_FILE)
    HTML_FILE.write_text(updated, encoding="utf-8")

    print("✅ Message routing fields repaired.")
    print()
    print("Organization choices:")
    print("  sandman-academy")
    print("  yesc")
    print("  other-organization")
    print("  not-sure")
    print()
    print("Location choices:")
    print("  solvang")
    print("  lompoc")
    print("  system-team")
    print("  not-sure")


if __name__ == "__main__":
    main()
