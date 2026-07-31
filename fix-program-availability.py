from pathlib import Path
from datetime import datetime
import re
import sys


PROGRAMS_FILE = Path("public/programs.html")


REPLACEMENTS = {
    # Zero2Hero — English
    "Boxing": """
<li>
  <strong class="program-coming-soon">Boxing</strong>
  — footwork, coordination, timing, and controlled boxing fundamentals.
  Available at selected academies.
</li>
""".strip(),

    # Zero2Hero — Spanish
    "Boxeo": """
<li>
  <strong class="program-coming-soon">Boxeo</strong>
  — juego de pies, coordinación, ritmo y fundamentos controlados de boxeo.
  Disponible en academias seleccionadas.
</li>
""".strip(),

    # Path2Legend — English
    "Muay Thai": """
<li>
  <strong class="program-coming-soon">Muay Thai</strong>
  — timing, footwork, conditioning, pressure, and composure.
  Available at selected academies.
</li>
""".strip(),

    # Quest2Mastery — English
    "Mixed Martial Arts (MMA)": """
<li>
  <strong class="program-coming-soon">Mixed Martial Arts (MMA)</strong>
  — integrated striking, wrestling, grappling, cage strategy, and competition preparation.
  Available at selected academies.
</li>
""".strip(),

    # Quest2Mastery — Spanish
    "Artes Marciales Mixtas (MMA)": """
<li>
  <strong class="program-coming-soon">Artes Marciales Mixtas (MMA)</strong>
  — golpeo integrado, lucha, grappling, estrategia en jaula y preparación competitiva.
  Disponible en academias seleccionadas.
</li>
""".strip(),

    # Quest2Mastery — English
    "Submission Grappling": """
<li>
  <strong class="program-coming-soon">Submission Grappling</strong>
  — positional control, submissions, transitions, escapes, and live grappling.
  Available at selected academies.
</li>
""".strip(),

    # Quest2Mastery — Spanish
    "Grappling de Sumisión": """
<li>
  <strong class="program-coming-soon">Grappling de Sumisión</strong>
  — control posicional, sumisiones, transiciones, escapes y grappling en vivo.
  Disponible en academias seleccionadas.
</li>
""".strip(),
}


def replace_list_item(text: str, title: str, replacement: str) -> tuple[str, int]:
    escaped_title = re.escape(title)

    pattern = re.compile(
        rf"""
        <li\b[^>]*>
        (?:
            (?!</li>)
            .
        )*?
        <strong\b[^>]*>
        \s*{escaped_title}\s*
        </strong>
        (?:
            (?!</li>)
            .
        )*?
        </li>
        """,
        re.IGNORECASE | re.DOTALL | re.VERBOSE,
    )

    return pattern.subn(replacement, text)


def main() -> None:
    if not PROGRAMS_FILE.exists():
        print(f"❌ File not found: {PROGRAMS_FILE}")
        sys.exit(1)

    original = PROGRAMS_FILE.read_text(encoding="utf-8")
    updated = original

    results = {}

    for title, replacement in REPLACEMENTS.items():
        updated, count = replace_list_item(updated, title, replacement)
        results[title] = count

    changed_count = sum(results.values())

    if changed_count == 0:
        print("❌ No matching program lines were found.")
        print("The wording in public/programs.html may be different.")
        sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_file = PROGRAMS_FILE.with_name(
        f"programs.html.before-availability-fix-{timestamp}"
    )

    backup_file.write_text(original, encoding="utf-8")
    PROGRAMS_FILE.write_text(updated, encoding="utf-8")

    print("✅ Program availability formatting fixed.")
    print()
    print("Changes found:")

    for title, count in results.items():
        status = "✅" if count else "⚠️"
        print(f"{status} {title}: {count}")

    print()
    print("✅ Only limited program titles are dimmed.")
    print("✅ Descriptions remain full brightness.")
    print("✅ Availability wording remains full brightness.")
    print(f"✅ Backup created: {backup_file}")


if __name__ == "__main__":
    main()
