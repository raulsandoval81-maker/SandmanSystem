#!/usr/bin/env python3

from datetime import datetime
from pathlib import Path
import shutil
import sys


ROOT = Path(__file__).resolve().parent

HTML_FILE = ROOT / "public/connect.html"
CSS_FILE = ROOT / "public/assets/css/connect.css"

STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")

START_MARKER = """    <!-- ====================================================
         WHY WE MEET FIRST
    ===================================================== -->
"""

END_MARKER = """  </main>"""

CSS_START = """/* =========================================================
   CONNECT STREAMLINED CONTENT
========================================================= */"""

NEW_CONTENT = r'''    <!-- ====================================================
         JOIN PATH
    ===================================================== -->

    <section class="connect-section connect-section--join">
      <div class="connect-container">

        <div data-lang-block="en">
          <p class="connect-eyebrow">
            Coach-Guided Enrollment
          </p>

          <h1>
            Find the Right Starting Point
          </h1>

          <p class="connect-lead">
            Every athlete begins differently.
          </p>

          <p>
            Complete the Interest Form so our admissions team can review your
            athlete’s age, experience, goals, preferred program, and location,
            then guide your family toward the appropriate next step.
          </p>

          <a
            href="/connect/interest/"
            class="button button--primary"
          >
            Complete the Interest Form
          </a>
        </div>

        <div data-lang-block="es" class="hidden-lang">
          <p class="connect-eyebrow">
            Inscripción Guiada
          </p>

          <h1>
            Encuentra el Punto de Partida Adecuado
          </h1>

          <p class="connect-lead">
            Cada atleta comienza desde un lugar diferente.
          </p>

          <p>
            Completa el Formulario de Interés para que nuestro equipo de
            admisiones revise la edad, experiencia, metas, programa preferido
            y ubicación de tu atleta, y guíe a tu familia hacia el siguiente
            paso adecuado.
          </p>

          <a
            href="/connect/interest/"
            class="button button--primary"
          >
            Completar el Formulario de Interés
          </a>
        </div>

      </div>
    </section>


    <!-- ====================================================
         CURRENT OPPORTUNITIES
    ===================================================== -->

    <section class="connect-section connect-section--opportunities">
      <div class="connect-container">

        <div data-lang-block="en">
          <div class="connect-heading connect-heading--centered">
            <p class="connect-eyebrow">
              Current Opportunities
            </p>

            <h2>
              See What Is Available Now
            </h2>

            <p>
              Enrollment openings, introductory programs, camps, clinics,
              special events, and location-specific opportunities may be
              available throughout the year.
            </p>
          </div>

          <article class="connect-opportunity-card">
            <span class="connect-opportunity-card__label">
              Programs Vary by Location
            </span>

            <h3>
              Ask About Current Opportunities
            </h3>

            <p>
              Send us a message to ask about promotions, eligibility,
              availability, deadlines, or opportunities at the Solvang or
              Lompoc location.
            </p>

            <a
              href="/connect/message.html"
              class="button button--secondary"
            >
              Ask About Opportunities
            </a>
          </article>
        </div>

        <div data-lang-block="es" class="hidden-lang">
          <div class="connect-heading connect-heading--centered">
            <p class="connect-eyebrow">
              Oportunidades Actuales
            </p>

            <h2>
              Conoce Lo Que Está Disponible
            </h2>

            <p>
              Durante el año pueden ofrecerse espacios de inscripción,
              programas introductorios, campamentos, clínicas, eventos
              especiales y oportunidades específicas por ubicación.
            </p>
          </div>

          <article class="connect-opportunity-card">
            <span class="connect-opportunity-card__label">
              Los Programas Varían por Ubicación
            </span>

            <h3>
              Pregunta por Oportunidades Actuales
            </h3>

            <p>
              Envíanos un mensaje para preguntar sobre promociones,
              requisitos, disponibilidad, fechas límite u oportunidades
              en las ubicaciones de Solvang o Lompoc.
            </p>

            <a
              href="/connect/message.html"
              class="button button--secondary"
            >
              Preguntar por Oportunidades
            </a>
          </article>
        </div>

      </div>
    </section>


    <!-- ====================================================
         COMMON QUESTIONS
    ===================================================== -->

    <section class="connect-section connect-section--faq">
      <div class="connect-container">

        <div data-lang-block="en">
          <div class="connect-heading">
            <p class="connect-eyebrow">
              Before You Begin
            </p>

            <h2>
              Common Questions
            </h2>
          </div>

          <div class="connect-faq-grid">

            <article class="connect-faq-card">
              <h3>Does my athlete need experience?</h3>

              <p>
                No. Many athletes begin with little or no combat-sports
                experience. Placement is based on age, readiness, goals,
                and availability.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>Are we required to enroll?</h3>

              <p>
                No. The admissions process helps your family and our team
                determine whether the program is the right fit.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>Can we observe a practice?</h3>

              <p>
                Visit and observation policies depend on the location and
                program. We will explain the available options before your
                appointment.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>When can training begin?</h3>

              <p>
                Start dates depend on program availability, completed
                enrollment requirements, and recommended placement.
              </p>
            </article>

          </div>
        </div>

        <div data-lang-block="es" class="hidden-lang">
          <div class="connect-heading">
            <p class="connect-eyebrow">
              Antes de Comenzar
            </p>

            <h2>
              Preguntas Frecuentes
            </h2>
          </div>

          <div class="connect-faq-grid">

            <article class="connect-faq-card">
              <h3>¿Mi atleta necesita experiencia?</h3>

              <p>
                No. Muchos atletas comienzan con poca o ninguna experiencia
                en deportes de combate. La colocación depende de la edad,
                preparación, metas y disponibilidad.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>¿Estamos obligados a inscribirnos?</h3>

              <p>
                No. El proceso de admisión ayuda a tu familia y a nuestro
                equipo a determinar si el programa es adecuado.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>¿Podemos observar una práctica?</h3>

              <p>
                Las políticas de visita y observación dependen de la ubicación
                y del programa. Explicaremos las opciones antes de tu cita.
              </p>
            </article>

            <article class="connect-faq-card">
              <h3>¿Cuándo puede comenzar el entrenamiento?</h3>

              <p>
                Las fechas de inicio dependen de la disponibilidad, los
                requisitos de inscripción y la colocación recomendada.
              </p>
            </article>

          </div>
        </div>

      </div>
    </section>


    <!-- ====================================================
         GENERAL QUESTIONS
    ===================================================== -->

    <section class="connect-section connect-section--contact">
      <div class="connect-container">

        <div data-lang-block="en">
          <div class="connect-heading connect-heading--centered">
            <p class="connect-eyebrow">
              General Questions
            </p>

            <h2>
              Send Us a Message
            </h2>

            <p>
              Have a question about programs, locations, promotions,
              partnerships, appointments, or the admissions process?
              Send us a message and our system team will route it to the
              appropriate organization or local manager.
            </p>
          </div>

          <div class="connect-actions">
            <a
              href="/connect/message.html"
              class="button button--secondary"
            >
              Send a Message
            </a>

            <a
              href="/connect/interest/"
              class="button button--primary"
            >
              Complete the Interest Form
            </a>
          </div>
        </div>

        <div data-lang-block="es" class="hidden-lang">
          <div class="connect-heading connect-heading--centered">
            <p class="connect-eyebrow">
              Preguntas Generales
            </p>

            <h2>
              Envíanos un Mensaje
            </h2>

            <p>
              ¿Tienes preguntas sobre programas, ubicaciones, promociones,
              alianzas, citas o el proceso de admisión? Envíanos un mensaje
              y nuestro equipo del sistema lo dirigirá a la organización o
              al gerente local correspondiente.
            </p>
          </div>

          <div class="connect-actions">
            <a
              href="/connect/message.html"
              class="button button--secondary"
            >
              Enviar un Mensaje
            </a>

            <a
              href="/connect/interest/"
              class="button button--primary"
            >
              Completar el Formulario de Interés
            </a>
          </div>
        </div>

      </div>
    </section>


'''


NEW_CSS = r'''
/* =========================================================
   CONNECT STREAMLINED CONTENT
========================================================= */

.connect-section--join {
  text-align: center;
}

.connect-section--join .connect-container {
  max-width: 820px;
}

.connect-section--join .button {
  margin-top: 1.5rem;
}

.connect-section--opportunities {
  background:
    radial-gradient(
      circle at 50% 0%,
      rgba(201, 161, 74, 0.12),
      transparent 40%
    );
}

.connect-opportunity-card {
  max-width: 820px;
  margin: 2rem auto 0;
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border: 1px solid rgba(201, 161, 74, 0.4);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.025);
  text-align: center;
}

.connect-opportunity-card__label {
  display: inline-block;
  margin-bottom: 0.8rem;
  color: var(--brand-gold, #c9a14a);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.connect-opportunity-card h3 {
  margin-top: 0;
}

.connect-opportunity-card p {
  max-width: 680px;
  margin-inline: auto;
}

.connect-opportunity-card .button {
  margin-top: 1rem;
}

.connect-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1rem;
  margin-top: 2rem;
}

@media (max-width: 640px) {
  .connect-actions {
    flex-direction: column;
  }

  .connect-actions .button {
    width: 100%;
  }
}
'''


def fail(message):
    print(f"❌ {message}")
    print("No files were changed.")
    sys.exit(1)


def backup(path):
    destination = path.with_name(
        f"{path.name}.before-streamline-{STAMP}"
    )
    shutil.copy2(path, destination)
    print(f"🛟 Backup: {destination.relative_to(ROOT)}")


def main():
    for path in (HTML_FILE, CSS_FILE):
        if not path.exists():
            fail(f"Missing {path.relative_to(ROOT)}")

    original_html = HTML_FILE.read_text(encoding="utf-8")
    original_css = CSS_FILE.read_text(encoding="utf-8")

    start_count = original_html.count(START_MARKER)
    end_count = original_html.count(END_MARKER)

    if start_count != 1:
        fail(
            f"Expected one start marker, found {start_count}."
        )

    if end_count != 1:
        fail(
            f"Expected one </main> marker, found {end_count}."
        )

    start_index = original_html.index(START_MARKER)
    end_index = original_html.index(END_MARKER, start_index)

    updated_html = (
        original_html[:start_index]
        + NEW_CONTENT
        + original_html[end_index:]
    )

    required_tokens = [
        "Current Opportunities",
        "Oportunidades Actuales",
        "Ask About Opportunities",
        'href="/connect/message.html"',
        'href="/connect/interest/"',
        "Find the Right Starting Point",
    ]

    for token in required_tokens:
        if token not in updated_html:
            fail(f"Missing expected token: {token}")

    removed_tokens = [
        "Every Family Starts With a Conversation",
        "The First Conversation",
        "A Thoughtful Decision",
        "Start the Conversation",
        "joinsandmancombat@gmail.com",
    ]

    for token in removed_tokens:
        if token in updated_html:
            fail(f"Old content still present: {token}")

    if CSS_START in original_css:
        css_prefix = original_css.split(
            CSS_START,
            1
        )[0].rstrip()

        updated_css = (
            css_prefix
            + "\n\n"
            + NEW_CSS.strip()
            + "\n"
        )
    else:
        updated_css = (
            original_css.rstrip()
            + "\n\n"
            + NEW_CSS.strip()
            + "\n"
        )

    if updated_html == original_html:
        fail("HTML would not change.")

    backup(HTML_FILE)
    backup(CSS_FILE)

    HTML_FILE.write_text(
        updated_html,
        encoding="utf-8"
    )

    CSS_FILE.write_text(
        updated_css,
        encoding="utf-8"
    )

    print()
    print("✅ Connect page streamlined.")
    print()
    print("Preserved:")
    print("  header")
    print("  bilingual PNG hero")
    print("  footer")
    print("  scripts")
    print("  original file formatting")
    print()
    print("New flow:")
    print("  PNG")
    print("  → Join through Interest Form")
    print("  → Current Opportunities")
    print("  → Four practical questions")
    print("  → Message Us or Interest Form")


if __name__ == "__main__":
    main()
