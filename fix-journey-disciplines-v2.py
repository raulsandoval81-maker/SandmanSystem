from pathlib import Path
import re

FILE = Path("public-next/journeys.html")

if not FILE.exists():
    raise SystemExit("Run this from the SandmanSystem root.")

text = FILE.read_text(encoding="utf-8")


def replace_programs(section_class: str, next_section_class: str, new_html: str) -> None:
    global text

    pattern = (
        rf'(<section class="journeys-section {re.escape(section_class)}">)'
        rf'(.*?)'
        rf'(?=<section class="journeys-section {re.escape(next_section_class)}">)'
    )

    match = re.search(pattern, text, flags=re.DOTALL)

    if not match:
        raise SystemExit(f"Could not find section: {section_class}")

    section = match.group(1) + match.group(2)

    programs_pattern = (
        r'<div class="journey-details">.*?</div>\s*</div>\s*</section>'
    )

    programs_match = re.search(
        programs_pattern,
        section,
        flags=re.DOTALL
    )

    if not programs_match:
        raise SystemExit(
            f"Could not find journey details inside {section_class}"
        )

    updated_section = (
        section[:programs_match.start()]
        + new_html
        + "\n      </div>\n    </section>\n\n"
    )

    text = (
        text[:match.start()]
        + updated_section
        + text[match.end():]
    )


zero2hero_html = """
        <div class="journey-details">
          <article class="journey-detail-card">
            <div data-lang-block="en">
              <h3>Programs</h3>

              <ul class="journey-program-list">
                <li>
                  <strong>Wrestling</strong> — fundamentals, mechanics,
                  balance, movement, and body control.
                </li>

                <li>
                  <strong>Muay Thai</strong> — movement, coordination,
                  distance, and controlled striking fundamentals.
                </li>

                <li class="journey-program-dormant">
                  <strong>Boxing</strong> — footwork, coordination,
                  timing, and controlled boxing fundamentals.

                  <span class="journey-availability">
                    Available at select academies.
                  </span>
                </li>
              </ul>
            </div>

            <div data-lang-block="es" class="hidden-lang">
              <h3>Programas</h3>

              <ul class="journey-program-list">
                <li>
                  <strong>Lucha</strong> — fundamentos, mecánica,
                  equilibrio, movimiento y control corporal.
                </li>

                <li>
                  <strong>Muay Thai</strong> — movimiento, coordinación,
                  distancia y fundamentos de golpeo controlado.
                </li>

                <li class="journey-program-dormant">
                  <strong>Boxeo</strong> — juego de pies, coordinación,
                  ritmo y fundamentos controlados de boxeo.

                  <span class="journey-availability">
                    Disponible en academias seleccionadas.
                  </span>
                </li>
              </ul>
            </div>
          </article>

          <article class="journey-detail-card">
            <div data-lang-block="en">
              <h3>Purpose</h3>

              <p class="journey-purpose">
                Develop confident young athletes with strong fundamentals,
                positive habits, and a lifelong appreciation for combat
                training.
              </p>
            </div>

            <div data-lang-block="es" class="hidden-lang">
              <h3>Propósito</h3>

              <p class="journey-purpose">
                Desarrollar jóvenes atletas seguros de sí mismos con
                fundamentos sólidos, hábitos positivos y un aprecio duradero
                por el entrenamiento de combate.
              </p>
            </div>
          </article>
        </div>
"""

path2legend_html = """
        <div class="journey-details">
          <article class="journey-detail-card">
            <div data-lang-block="en">
              <h3>Programs</h3>

              <ul class="journey-program-list">
                <li>
                  <strong>Wrestling</strong> — advanced skills, pressure,
                  leadership, and competition readiness.
                </li>

                <li>
                  <strong>Boxing</strong> — timing, footwork, conditioning,
                  pressure, and composure.
                </li>

                <li class="journey-program-dormant">
                  <strong>Muay Thai</strong> — timing, footwork,
                  conditioning, pressure, and composure.

                  <span class="journey-availability">
                    Available at select academies.
                  </span>
                </li>
              </ul>
            </div>

            <div data-lang-block="es" class="hidden-lang">
              <h3>Programas</h3>

              <ul class="journey-program-list">
                <li>
                  <strong>Lucha</strong> — habilidades avanzadas, presión,
                  liderazgo y preparación competitiva.
                </li>

                <li>
                  <strong>Boxeo</strong> — ritmo, juego de pies,
                  acondicionamiento, presión y compostura.
                </li>

                <li class="journey-program-dormant">
                  <strong>Muay Thai</strong> — ritmo, juego de pies,
                  acondicionamiento, presión y compostura.

                  <span class="journey-availability">
                    Disponible en academias seleccionadas.
                  </span>
                </li>
              </ul>
            </div>
          </article>

          <article class="journey-detail-card">
            <div data-lang-block="en">
              <h3>Purpose</h3>

              <p class="journey-purpose">
                Prepare teen and adult athletes for competition, leadership,
                and long-term development through disciplined training and
                consistent accountability.
              </p>
            </div>

            <div data-lang-block="es" class="hidden-lang">
              <h3>Propósito</h3>

              <p class="journey-purpose">
                Preparar a atletas adolescentes y adultos para la competencia,
                el liderazgo y el desarrollo a largo plazo mediante
                entrenamiento disciplinado y responsabilidad constante.
              </p>
            </div>
          </article>
        </div>
"""

replace_programs(
    "journey-zero2hero",
    "journey-path2legend",
    zero2hero_html
)

replace_programs(
    "journey-path2legend",
    "journey-quest2mastery",
    path2legend_html
)

if ".journey-program-dormant{" not in text:
    css_anchor = "    .journey-purpose{"

    css = """
    .journey-program-dormant{
      opacity:.52;
      font-style:italic;
    }

    .journey-program-dormant strong{
      color:var(--muted);
    }

"""

    if css_anchor not in text:
        raise SystemExit("Could not find CSS insertion point.")

    text = text.replace(css_anchor, css + css_anchor, 1)

FILE.write_text(text, encoding="utf-8")

print("Updated successfully.")
print("Zero2Hero: Wrestling, Muay Thai, dormant Boxing.")
print("Path2Legend: Wrestling, Boxing, dormant Muay Thai.")
