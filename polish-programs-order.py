from pathlib import Path
import sys


PROGRAMS_FILE = Path("public/programs.html")


AVAILABILITY_BLOCK = """
<section class="section program-availability">
  <div class="note-strip">

    <div data-lang-block="en">
      <strong>Program Availability:</strong>
      Programs and disciplines may vary by academy. Each Sandman Combat™
      location offers programs based on certified coaches, facility resources,
      insurance requirements, and local community needs.
    </div>

    <div data-lang-block="es" class="hidden-lang">
      <strong>Disponibilidad de Programas:</strong>
      Los programas y disciplinas pueden variar según la academia. Cada
      ubicación de Sandman Combat™ ofrece programas de acuerdo con entrenadores
      certificados, los recursos de sus instalaciones, los requisitos de seguro
      y las necesidades de la comunidad local.
    </div>

  </div>
</section>
""".strip()


PHILOSOPHY_START = """
<section class="section">
  <article class="panel">
    <div data-lang-block="en">
      <h2 class="section-title">
        Everyone Starts at Zero.<br>
        Every Step is Earned.
""".strip()


FITNESS_START = """
<section id="fitness" class="section program-section program-anchor">
""".strip()


MAIN_END = """
  </main>
""".strip()


def find_matching_section_end(text: str, start_index: int) -> int:
    position = start_index
    depth = 0

    while position < len(text):
        next_open = text.find("<section", position)
        next_close = text.find("</section>", position)

        if next_close == -1:
            raise ValueError("Could not find the closing </section> tag.")

        if next_open != -1 and next_open < next_close:
            depth += 1
            position = next_open + len("<section")
        else:
            depth -= 1
            position = next_close + len("</section>")

            if depth == 0:
                return position

    raise ValueError("Section tags appear to be unbalanced.")


def main() -> None:
    if not PROGRAMS_FILE.exists():
        print(f"❌ File not found: {PROGRAMS_FILE}")
        sys.exit(1)

    text = PROGRAMS_FILE.read_text(encoding="utf-8")

    if PHILOSOPHY_START not in text:
        print("❌ Could not locate the 'Everyone Starts at Zero' section.")
        sys.exit(1)

    if FITNESS_START not in text:
        print("❌ Could not locate the HIIT Fit section.")
        sys.exit(1)

    philosophy_start = text.index(PHILOSOPHY_START)
    philosophy_end = find_matching_section_end(text, philosophy_start)

    philosophy_block = text[philosophy_start:philosophy_end].strip()

    # Remove the philosophy and identity section from its current position.
    text = (
        text[:philosophy_start].rstrip()
        + "\n\n"
        + text[philosophy_end:].lstrip()
    )

    # Remove an earlier copy of the availability block, if the script is rerun.
    text = text.replace(AVAILABILITY_BLOCK, "").rstrip() + "\n"

    fitness_start = text.index(FITNESS_START)
    fitness_end = find_matching_section_end(text, fitness_start)

    replacement = (
        text[:fitness_end].rstrip()
        + "\n\n"
        + AVAILABILITY_BLOCK
        + "\n\n"
        + philosophy_block
        + "\n\n"
        + text[fitness_end:].lstrip()
    )

    # Create a backup before writing.
    backup_file = PROGRAMS_FILE.with_suffix(".html.before-program-order")
    backup_file.write_text(
        PROGRAMS_FILE.read_text(encoding="utf-8"),
        encoding="utf-8",
    )

    PROGRAMS_FILE.write_text(replacement, encoding="utf-8")

    print("✅ Programs page polished successfully.")
    print("✅ HIIT Fit now appears before the closing philosophy section.")
    print("✅ Program Availability note inserted after HIIT Fit.")
    print("✅ Philosophy and Program Identity Notice moved to the bottom.")
    print(f"✅ Backup created: {backup_file}")


if __name__ == "__main__":
    main()
