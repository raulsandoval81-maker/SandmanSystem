#!/usr/bin/env python3
"""
Sandman Combat — Public Site Shell Normalizer

File:
    tools/builders/polish-public-site.py

Run:
    python3 tools/builders/polish-public-site.py

Purpose:
    Perform a one-time normalization pass across public-next HTML pages.

What it does:
    1. Replaces page-specific headers with the shared navigation mount.
    2. Replaces page-specific footers with the shared footer mount.
    3. Adds mounts when a page does not already contain them.
    4. Normalizes shared JavaScript includes.
    5. Creates one backup of every changed page.
    6. Skips component files so navigation.html and footer.html remain intact.
    7. Can safely be run again without duplicating mounts or scripts.

Expected architecture:
    public-next/
    ├── components/
    │   ├── navigation.html
    │   └── footer.html
    ├── assets/
    │   └── js/
    │       ├── component-loader.js
    │       ├── language.js
    │       ├── theme.js
    │       └── navigation.js
    └── *.html
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

SCRIPT_PATH = Path(__file__).resolve()

# Script location:
# public-next/tools/builders/polish-public-site.py
PUBLIC_ROOT = SCRIPT_PATH.parents[2]
PROJECT_ROOT = PUBLIC_ROOT.parent

COMPONENTS_DIR = PUBLIC_ROOT / "components"

NAVIGATION_COMPONENT = COMPONENTS_DIR / "navigation.html"
FOOTER_COMPONENT = COMPONENTS_DIR / "footer.html"

BACKUP_SUFFIX = ".before-shared-shell"

NAVIGATION_MOUNT = """
  <!-- Shared site navigation -->
  <div
    id="navigation"
    data-component="/components/navigation.html"
  ></div>
""".strip("\n")

FOOTER_MOUNT = """
  <!-- Shared site footer -->
  <div
    id="footer"
    data-component="/components/footer.html"
  ></div>
""".strip("\n")

STANDARD_SCRIPTS = """
  <script src="/assets/js/component-loader.js" defer></script>
  <script src="/assets/js/language.js" defer></script>
  <script src="/assets/js/theme.js" defer></script>
  <script src="/assets/js/navigation.js" defer></script>
""".strip("\n")

SHARED_SCRIPT_PATHS = (
    "/assets/js/component-loader.js",
    "/assets/js/language.js",
    "/assets/js/theme.js",
    "/assets/js/navigation.js",
)

SKIPPED_DIRECTORY_NAMES = {
    ".git",
    "components",
    "node_modules",
    "vendor",
    "archive",
    "backups",
    "__pycache__",
}

SKIPPED_FILE_NAMES = {
    "navigation.html",
    "footer.html",
    "cta.html",
    "journey-card.html",
}


# ============================================================
# REGULAR EXPRESSIONS
# ============================================================

HEADER_PATTERN = re.compile(
    r"""
    (?P<indent>^[ \t]*)
    <header\b
    (?=[^>]*\bclass\s*=\s*["'][^"']*\bsite-header\b[^"']*["'])
    [^>]*>
    .*?
    </header>
    """,
    re.IGNORECASE | re.DOTALL | re.MULTILINE | re.VERBOSE,
)

FOOTER_PATTERN = re.compile(
    r"""
    (?P<indent>^[ \t]*)
    <footer\b
    (?=[^>]*\bclass\s*=\s*["'][^"']*\bsite-footer\b[^"']*["'])
    [^>]*>
    .*?
    </footer>
    """,
    re.IGNORECASE | re.DOTALL | re.MULTILINE | re.VERBOSE,
)

NAVIGATION_MOUNT_PATTERN = re.compile(
    r"""
    <div\b
    (?=[^>]*\bid\s*=\s*["']navigation["'])
    [^>]*>
    \s*
    </div>
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE,
)

FOOTER_MOUNT_PATTERN = re.compile(
    r"""
    <div\b
    (?=[^>]*\bid\s*=\s*["']footer["'])
    [^>]*>
    \s*
    </div>
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE,
)

BODY_OPEN_PATTERN = re.compile(
    r"<body\b[^>]*>",
    re.IGNORECASE,
)

BODY_CLOSE_PATTERN = re.compile(
    r"</body\s*>",
    re.IGNORECASE,
)

SCRIPT_TAG_PATTERN = re.compile(
    r"""
    ^[ \t]*
    <script\b
    (?=[^>]*\bsrc\s*=\s*["']
        (?P<src>[^"']+)
    ["'])
    [^>]*>
    \s*
    </script>
    [ \t]*
    (?:\r?\n)?
    """,
    re.IGNORECASE | re.MULTILINE | re.VERBOSE,
)


# ============================================================
# DATA TYPES
# ============================================================

@dataclass
class FileResult:
    path: Path
    changed: bool
    backed_up: bool
    notes: list[str]


# ============================================================
# HELPERS
# ============================================================

def fail(message: str) -> None:
    print(f"❌ {message}", file=sys.stderr)
    raise SystemExit(1)


def normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def indent_block(block: str, indent: str) -> str:
    return "\n".join(
        f"{indent}{line}" if line else ""
        for line in block.splitlines()
    )


def should_skip(path: Path) -> bool:
    if path.name in SKIPPED_FILE_NAMES:
        return True

    relative_parts = path.relative_to(PUBLIC_ROOT).parts

    return any(
        part in SKIPPED_DIRECTORY_NAMES
        for part in relative_parts[:-1]
    )


def discover_html_files() -> list[Path]:
    files: list[Path] = []

    for path in PUBLIC_ROOT.rglob("*.html"):
        if should_skip(path):
            continue

        files.append(path)

    return sorted(files)


def ensure_required_structure() -> None:
    if not PUBLIC_ROOT.exists():
        fail(f"Public directory not found: {PUBLIC_ROOT}")

    if not NAVIGATION_COMPONENT.exists():
        fail(
            "Shared navigation component not found:\n"
            f"   {NAVIGATION_COMPONENT}"
        )

    if not FOOTER_COMPONENT.exists():
        fail(
            "Shared footer component not found:\n"
            f"   {FOOTER_COMPONENT}"
        )


def create_backup(path: Path) -> bool:
    backup = path.with_name(path.name + BACKUP_SUFFIX)

    if backup.exists():
        return False

    shutil.copy2(path, backup)
    return True


# ============================================================
# HEADER NORMALIZATION
# ============================================================

def normalize_navigation_mount(
    text: str,
    notes: list[str],
) -> str:
    existing_mount = NAVIGATION_MOUNT_PATTERN.search(text)

    if existing_mount:
        replacement = NAVIGATION_MOUNT
        updated = (
            text[:existing_mount.start()]
            + replacement
            + text[existing_mount.end():]
        )

        if updated != text:
            notes.append("normalized navigation mount")

        return updated

    header_match = HEADER_PATTERN.search(text)

    if header_match:
        indent = header_match.group("indent")
        replacement = indent_block(NAVIGATION_MOUNT, indent)

        notes.append("replaced inline site header")

        return (
            text[:header_match.start()]
            + replacement
            + text[header_match.end():]
        )

    body_match = BODY_OPEN_PATTERN.search(text)

    if not body_match:
        notes.append("warning: no body tag; navigation not inserted")
        return text

    insertion = "\n\n" + indent_block(NAVIGATION_MOUNT, "  ")

    notes.append("inserted navigation mount")

    return (
        text[:body_match.end()]
        + insertion
        + text[body_match.end():]
    )


# ============================================================
# FOOTER NORMALIZATION
# ============================================================

def normalize_footer_mount(
    text: str,
    notes: list[str],
) -> str:
    existing_mount = FOOTER_MOUNT_PATTERN.search(text)

    if existing_mount:
        replacement = FOOTER_MOUNT
        updated = (
            text[:existing_mount.start()]
            + replacement
            + text[existing_mount.end():]
        )

        if updated != text:
            notes.append("normalized footer mount")

        return updated

    footer_match = FOOTER_PATTERN.search(text)

    if footer_match:
        indent = footer_match.group("indent")
        replacement = indent_block(FOOTER_MOUNT, indent)

        notes.append("replaced inline site footer")

        return (
            text[:footer_match.start()]
            + replacement
            + text[footer_match.end():]
        )

    body_close_matches = list(BODY_CLOSE_PATTERN.finditer(text))

    if not body_close_matches:
        notes.append("warning: no closing body tag; footer not inserted")
        return text

    body_close = body_close_matches[-1]
    insertion = indent_block(FOOTER_MOUNT, "  ") + "\n\n"

    notes.append("inserted footer mount")

    return (
        text[:body_close.start()]
        + insertion
        + text[body_close.start():]
    )


# ============================================================
# SCRIPT NORMALIZATION
# ============================================================

def remove_shared_scripts(text: str) -> tuple[str, int]:
    removed = 0

    def replacement(match: re.Match[str]) -> str:
        nonlocal removed

        src = match.group("src")

        normalized_src = src.split("?", 1)[0].strip()

        if normalized_src in SHARED_SCRIPT_PATHS:
            removed += 1
            return ""

        return match.group(0)

    return SCRIPT_TAG_PATTERN.sub(replacement, text), removed


def normalize_scripts(
    text: str,
    notes: list[str],
) -> str:
    text, removed_count = remove_shared_scripts(text)

    body_close_matches = list(BODY_CLOSE_PATTERN.finditer(text))

    if not body_close_matches:
        notes.append("warning: no closing body tag; scripts not inserted")
        return text

    body_close = body_close_matches[-1]

    insertion = (
        "\n"
        + indent_block(STANDARD_SCRIPTS, "  ")
        + "\n\n"
    )

    text = (
        text[:body_close.start()].rstrip()
        + insertion
        + text[body_close.start():]
    )

    if removed_count:
        notes.append(
            f"normalized shared scripts ({removed_count} removed)"
        )
    else:
        notes.append("inserted shared scripts")

    return text


# ============================================================
# BASIC DOCUMENT CLEANUP
# ============================================================

def normalize_document_spacing(text: str) -> str:
    text = normalize_newlines(text)

    # Remove trailing whitespace.
    text = "\n".join(line.rstrip() for line in text.splitlines())

    # Avoid very large blank gaps while preserving readable spacing.
    text = re.sub(r"\n{4,}", "\n\n\n", text)

    return text.rstrip() + "\n"


def process_html(path: Path, dry_run: bool) -> FileResult:
    original = path.read_text(encoding="utf-8")
    updated = normalize_newlines(original)

    notes: list[str] = []

    updated = normalize_navigation_mount(updated, notes)
    updated = normalize_footer_mount(updated, notes)
    updated = normalize_scripts(updated, notes)
    updated = normalize_document_spacing(updated)

    original_normalized = normalize_document_spacing(original)
    changed = updated != original_normalized
    backed_up = False

    if changed and not dry_run:
        backed_up = create_backup(path)
        path.write_text(updated, encoding="utf-8")

    return FileResult(
        path=path,
        changed=changed,
        backed_up=backed_up,
        notes=notes,
    )


# ============================================================
# COMPONENT LOADER
# ============================================================

COMPONENT_LOADER_CONTENT = """\
/**
 * Sandman Combat shared component loader.
 *
 * Loads HTML fragments declared with:
 *
 *   <div data-component="/components/navigation.html"></div>
 *
 * After all components load, it dispatches:
 *
 *   components:loaded
 */

document.addEventListener("DOMContentLoaded", async () => {
  const mounts = Array.from(
    document.querySelectorAll("[data-component]")
  );

  if (!mounts.length) {
    document.dispatchEvent(
      new CustomEvent("components:loaded")
    );
    return;
  }

  await Promise.all(
    mounts.map(async (mount) => {
      const source = mount.dataset.component;

      if (!source) {
        return;
      }

      try {
        const response = await fetch(source);

        if (!response.ok) {
          throw new Error(
            `Unable to load ${source}: ${response.status}`
          );
        }

        mount.innerHTML = await response.text();
        mount.dataset.componentLoaded = "true";
      } catch (error) {
        console.error(error);
        mount.dataset.componentError = "true";
      }
    })
  );

  document.dispatchEvent(
    new CustomEvent("components:loaded")
  );
});
"""


def ensure_component_loader(dry_run: bool) -> tuple[bool, Path]:
    loader_path = PUBLIC_ROOT / "assets/js/component-loader.js"
    desired = COMPONENT_LOADER_CONTENT.rstrip() + "\n"

    if loader_path.exists():
        current = loader_path.read_text(encoding="utf-8")

        if normalize_newlines(current) == desired:
            return False, loader_path

    if not dry_run:
        loader_path.parent.mkdir(parents=True, exist_ok=True)

        if loader_path.exists():
            create_backup(loader_path)

        loader_path.write_text(desired, encoding="utf-8")

    return True, loader_path


# ============================================================
# REPORTING
# ============================================================

def relative(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def print_result(result: FileResult, dry_run: bool) -> None:
    if not result.changed:
        print(f"✓ unchanged  {relative(result.path)}")
        return

    action = "would update" if dry_run else "updated"
    print(f"✅ {action:<12} {relative(result.path)}")

    for note in result.notes:
        print(f"   • {note}")

    if result.backed_up:
        backup_name = result.path.name + BACKUP_SUFFIX
        print(f"   • backup: {backup_name}")


# ============================================================
# MAIN
# ============================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize public-next pages to use the shared "
            "navigation and footer components."
        )
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without writing files.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_args()

    ensure_required_structure()

    html_files = discover_html_files()

    if not html_files:
        fail(f"No HTML pages found beneath {PUBLIC_ROOT}")

    mode = "DRY RUN" if args.dry_run else "APPLYING CHANGES"

    print()
    print("============================================================")
    print(" SANDMAN COMBAT — PUBLIC SITE NORMALIZATION")
    print("============================================================")
    print(f" Mode:       {mode}")
    print(f" Project:    {PROJECT_ROOT}")
    print(f" Public:     {PUBLIC_ROOT}")
    print(f" HTML files: {len(html_files)}")
    print("============================================================")
    print()

    loader_changed, loader_path = ensure_component_loader(
        dry_run=args.dry_run
    )

    if loader_changed:
        loader_action = (
            "would create/update"
            if args.dry_run
            else "created/updated"
        )
        print(
            f"✅ {loader_action} "
            f"{relative(loader_path)}"
        )
    else:
        print(
            f"✓ unchanged  "
            f"{relative(loader_path)}"
        )

    print()

    results = [
        process_html(path, dry_run=args.dry_run)
        for path in html_files
    ]

    for result in results:
        print_result(result, dry_run=args.dry_run)

    changed_count = sum(result.changed for result in results)
    unchanged_count = len(results) - changed_count

    print()
    print("============================================================")
    print(" COMPLETE")
    print("============================================================")
    print(f" Changed:   {changed_count}")
    print(f" Unchanged: {unchanged_count}")

    if args.dry_run:
        print()
        print("No files were written.")
        print(
            "Run without --dry-run to apply the changes:"
        )
        print(
            "python3 tools/builders/polish-public-site.py"
        )
    else:
        print()
        print(
            "Changed pages received one-time backups ending in:"
        )
        print(BACKUP_SUFFIX)

    print("============================================================")
    print()


if __name__ == "__main__":
    main()
