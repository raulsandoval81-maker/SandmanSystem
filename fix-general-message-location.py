#!/usr/bin/env python3

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import re
import shutil
import sys


ROOT = Path(__file__).resolve().parent

MESSAGE_HTML = ROOT / "public/connect/message.html"
MESSAGE_JS = ROOT / "public/connect/message.js"
RULES_FILE = ROOT / "firestore.rules"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")


def fail(message: str) -> None:
    print(f"\n❌ {message}")
    sys.exit(1)


def backup(path: Path) -> Path:
    target = path.with_name(
        f"{path.name}.before-message-location-fix-{STAMP}"
    )

    shutil.copy2(path, target)

    print(f"🛟 Backup: {target.relative_to(ROOT)}")
    return target


def get_general_messages_block(
    text: str,
) -> tuple[str, str, str]:
    start_marker = "match /general_messages/{messageId} {"

    start = text.find(start_marker)

    if start == -1:
        fail(
            "Could not find the general_messages rules block."
        )

    default_marker = "DEFAULT CLOSED"
    default_position = text.find(default_marker, start)

    if default_position == -1:
        fail(
            "Could not find DEFAULT CLOSED after "
            "general_messages."
        )

    comment_start = text.rfind(
        "/*",
        start,
        default_position
    )

    if comment_start == -1:
        fail(
            "Could not locate the DEFAULT CLOSED comment."
        )

    return (
        text[:start],
        text[start:comment_start],
        text[comment_start:]
    )


CANONICAL_LOCATION_SELECT = '''<select
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
              </select>'''


def patch_message_html(text: str) -> str:
    select_pattern = re.compile(
        r'<select\b'
        r'(?=[^>]*\bid=["\']preferredLocation["\'])'
        r'[^>]*>'
        r'.*?'
        r'</select>',
        re.DOTALL | re.IGNORECASE,
    )

    matches = list(select_pattern.finditer(text))

    if not matches:
        fail(
            "No preferredLocation select was found in "
            "public/connect/message.html."
        )

    print(
        "ℹ️  preferredLocation selects found:",
        len(matches)
    )

    first = matches[0]

    pieces: list[str] = [
        text[:first.start()],
        CANONICAL_LOCATION_SELECT,
    ]

    cursor = first.end()

    for duplicate in matches[1:]:
        pieces.append(text[cursor:duplicate.start()])

        # Remove the duplicate select itself.
        cursor = duplicate.end()

    pieces.append(text[cursor:])

    updated = "".join(pieces)

    remaining = len(
        list(select_pattern.finditer(updated))
    )

    if remaining != 1:
        fail(
            "The HTML patch did not leave exactly one "
            f"preferredLocation select. Found {remaining}."
        )

    return updated


def patch_message_js(text: str) -> str:
    if 'organization: "sandman-academy"' in text:
        text = text.replace(
            'organization: "sandman-academy"',
            'organization: "sandman-system"',
            1,
        )

    required_snippets = [
        "preferredOrganization:",
        "preferredLocation:",
        'routingStage: "ADMIN_REVIEW"',
        (
            'routingPolicy:\n'
            '          '
            '"ADMIN_TO_ORGANIZATION_LOCATION_MANAGER"'
        ),
    ]

    missing = [
        snippet
        for snippet in required_snippets
        if snippet not in text
    ]

    if missing:
        fail(
            "message.js is missing expected routing fields: "
            + ", ".join(missing)
        )

    return text


def add_allowed_fields(block: str) -> str:
    has_org = '"preferredOrganization"' in block
    has_location = '"preferredLocation"' in block

    if has_org and has_location:
        return block

    anchor = '''          "message",
          "contactConsent",
'''

    if anchor not in block:
        fail(
            "Could not find the message/contactConsent "
            "field-list anchor in firestore.rules."
        )

    replacement_lines = '''          "message",
'''

    if not has_org:
        replacement_lines += (
            '          "preferredOrganization",\n'
        )

    if not has_location:
        replacement_lines += (
            '          "preferredLocation",\n'
        )

    replacement_lines += '''          "contactConsent",
'''

    return block.replace(
        anchor,
        replacement_lines,
        1,
    )


def add_preference_validation(block: str) -> str:
    has_org_validation = (
        "request.resource.data.preferredOrganization in ["
        in block
    )

    has_location_validation = (
        "request.resource.data.preferredLocation in ["
        in block
    )

    if has_org_validation and has_location_validation:
        return block

    anchor = '''        && request.resource.data.contactConsent == true
'''

    if anchor not in block:
        fail(
            "Could not find contactConsent validation "
            "in general_messages rules."
        )

    validation = ""

    if not has_org_validation:
        validation += '''
        && request.resource.data.preferredOrganization
           is string

        && request.resource.data.preferredOrganization in [
          "sandman-academy",
          "yesc",
          "other-organization",
          "not-sure"
        ]
'''

    if not has_location_validation:
        validation += '''
        && request.resource.data.preferredLocation
           is string

        && request.resource.data.preferredLocation in [
          "solvang",
          "lompoc",
          "system-team",
          "not-sure"
        ]
'''

    return block.replace(
        anchor,
        validation + "\n" + anchor,
        1,
    )


def patch_rules(text: str) -> str:
    prefix, block, suffix = get_general_messages_block(
        text
    )

    block = block.replace(
        (
            'request.resource.data.organization == '
            '"sandman-academy"'
        ),
        (
            'request.resource.data.organization == '
            '"sandman-system"'
        ),
        1,
    )

    block = add_allowed_fields(block)
    block = add_preference_validation(block)

    return prefix + block + suffix


def main() -> None:
    required_files = [
        MESSAGE_HTML,
        MESSAGE_JS,
        RULES_FILE,
    ]

    for path in required_files:
        if not path.exists():
            fail(
                f"Missing required file: "
                f"{path.relative_to(ROOT)}"
            )

    original_html = MESSAGE_HTML.read_text(
        encoding="utf-8"
    )

    original_js = MESSAGE_JS.read_text(
        encoding="utf-8"
    )

    original_rules = RULES_FILE.read_text(
        encoding="utf-8"
    )

    updated_html = patch_message_html(
        original_html
    )

    updated_js = patch_message_js(
        original_js
    )

    updated_rules = patch_rules(
        original_rules
    )

    changes = {
        MESSAGE_HTML: (
            original_html,
            updated_html,
        ),
        MESSAGE_JS: (
            original_js,
            updated_js,
        ),
        RULES_FILE: (
            original_rules,
            updated_rules,
        ),
    }

    changed_paths = [
        path
        for path, (before, after) in changes.items()
        if before != after
    ]

    if not changed_paths:
        print(
            "\n✅ Message location and Firestore rules "
            "are already synchronized."
        )
        return

    for path in changed_paths:
        backup(path)

    for path in changed_paths:
        _, updated = changes[path]
        path.write_text(
            updated,
            encoding="utf-8"
        )

    print("\n✅ Message routing fields synchronized.")

    print("\nFiles changed:")

    for path in changed_paths:
        print(f"  {path.relative_to(ROOT)}")

    print("\nLocation choices:")
    print("  solvang")
    print("  lompoc")
    print("  system-team")
    print("  not-sure")

    print("\nNext verification:")
    print(
        "  grep -n "
        '\'id="preferredLocation"\\|'
        'name="preferredLocation"\' '
        "public/connect/message.html"
    )
    print(
        "  node --check "
        "public/connect/message.js"
    )
    print(
        "  firebase deploy "
        "--only firestore:rules --dry-run"
    )
    print("  git diff --check")
    print(
        "  git diff --stat -- "
        "firestore.rules "
        "public/connect/message.html "
        "public/connect/message.js"
    )


if __name__ == "__main__":
    main()
