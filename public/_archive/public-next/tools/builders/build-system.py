#!/usr/bin/env python3
"""
Build the Sandman Combat public-next System page.

Run from the SandmanSystem project root:

    python3 public-next/tools/builders/build-system.py

Creates or replaces:

    public-next/system.html
    public-next/assets/css/system.css

Expected image files:

    public-next/assets/images/hero/hero-system-en.png
    public-next/assets/images/hero/hero-system-es.png
    public-next/assets/images/sections/system-pillars.png
    public-next/assets/images/sections/system-progress.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC_NEXT = ROOT / "public-next"
HTML_FILE = PUBLIC_NEXT / "system.html"
CSS_FILE = PUBLIC_NEXT / "assets" / "css" / "system.css"

HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>The Sandman System™ | Sandman Combat™</title>

  <meta
    name="description"
    content="Learn how the Sandman System develops athletes through Combat, Strength, Honor, Conditioning, earned progression, and coach-led accountability."
  />

  <link rel="stylesheet" href="assets/css/site.css" />
  <link rel="stylesheet" href="assets/css/system.css" />

  <script src="assets/js/language.js" defer></script>
  <script src="assets/js/theme.js" defer></script>
  <script src="assets/js/navigation.js" defer></script>
</head>

<body>
  <a class="skip-link" href="#main-content">
    <span data-lang-block="en">Skip to main content</span>
    <span data-lang-block="es" class="hidden-lang">Saltar al contenido principal</span>
  </a>

  <header class="site-header">
    <div class="nav-shell">
      <a class="brand-link" href="index.html" aria-label="Sandman Combat home">
        <span class="brand-mark" aria-hidden="true">S</span>
        <span class="brand-copy">
          <strong>Sandman</strong>
          <span>Combat</span>
        </span>
      </a>

      <button
        class="nav-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="primary-navigation"
        aria-label="Open navigation"
      >
        <span></span><span></span><span></span>
      </button>

      <nav id="primary-navigation" class="primary-nav" aria-label="Primary navigation">
        <a href="index.html">
          <span data-lang-block="en">Home</span>
          <span data-lang-block="es" class="hidden-lang">Inicio</span>
        </a>

        <a href="about.html">
          <span data-lang-block="en">About</span>
          <span data-lang-block="es" class="hidden-lang">Nosotros</span>
        </a>

        <a href="journeys.html">
          <span data-lang-block="en">Journeys</span>
          <span data-lang-block="es" class="hidden-lang">Caminos</span>
        </a>

        <a href="system.html" aria-current="page">
          <span data-lang-block="en">The System</span>
          <span data-lang-block="es" class="hidden-lang">El Sistema</span>
        </a>

        <a href="impact.html">
          <span data-lang-block="en">Impact</span>
          <span data-lang-block="es" class="hidden-lang">Impacto</span>
        </a>

        <a href="library.html">
          <span data-lang-block="en">Library</span>
          <span data-lang-block="es" class="hidden-lang">Biblioteca</span>
        </a>

        <a class="nav-cta" href="connect.html">
          <span data-lang-block="en">Connect</span>
          <span data-lang-block="es" class="hidden-lang">Conéctate</span>
        </a>
      </nav>

      <div class="nav-tools">
        <div class="language-toggle" role="group" aria-label="Language">
          <button type="button" class="language-button is-active" data-language-button="en">EN</button>
          <button type="button" class="language-button" data-language-button="es">ES</button>
        </div>

        <button
          class="theme-toggle"
          type="button"
          aria-label="Toggle light and dark appearance"
          data-theme-toggle
        >
          <span aria-hidden="true">◐</span>
        </button>
      </div>
    </div>
  </header>

  <main id="main-content">
    <section class="system-hero">
      <div class="system-hero-media" aria-hidden="true">
        <img src="assets/images/hero/hero-system-en.png" alt="" data-lang-block="en" />
        <img src="assets/images/hero/hero-system-es.png" alt="" data-lang-block="es" class="hidden-lang" />
      </div>

      <div class="system-hero-overlay"></div>

      <div class="section-shell system-hero-content">
        <p class="eyebrow">
          <span data-lang-block="en">The Sandman System™</span>
          <span data-lang-block="es" class="hidden-lang">El Sistema Sandman™</span>
        </p>

        <h1>
          <span data-lang-block="en">
            The Coach Teaches.<br />
            The Athlete Earns.<br />
            <strong>The System Remembers.</strong>
          </span>

          <span data-lang-block="es" class="hidden-lang">
            El Entrenador Enseña.<br />
            El Atleta Se lo Gana.<br />
            <strong>El Sistema lo Recuerda.</strong>
          </span>
        </h1>

        <p class="hero-lead">
          <span data-lang-block="en">
            Sandman is built around earned progression, meaningful experiences,
            visible standards, and long-term athlete development.
          </span>

          <span data-lang-block="es" class="hidden-lang">
            Sandman se construye sobre progreso ganado, experiencias significativas,
            estándares visibles y desarrollo atlético a largo plazo.
          </span>
        </p>
      </div>
    </section>

    <section class="section system-intro">
      <div class="section-shell intro-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">More Than a Schedule</span>
            <span data-lang-block="es" class="hidden-lang">Más Que un Horario</span>
          </p>

          <h2>
            <span data-lang-block="en">Progress Is Earned Through Experience</span>
            <span data-lang-block="es" class="hidden-lang">El Progreso Se Gana Mediante la Experiencia</span>
          </h2>
        </div>

        <div>
          <p class="lead" data-lang-block="en">
            Sandman does not move athletes forward simply because a calendar changed.
          </p>

          <p data-lang-block="en">
            Lessons are earned through progression. The coach introduces the next
            challenge when the athlete is ready. The athlete completes meaningful work.
            The system records the journey so progress remains clear, consistent, and accountable.
          </p>

          <p class="lead hidden-lang" data-lang-block="es">
            Sandman no hace avanzar a los atletas simplemente porque cambió el calendario.
          </p>

          <p class="hidden-lang" data-lang-block="es">
            Las lecciones se ganan mediante la progresión. El entrenador presenta el
            siguiente desafío cuando el atleta está preparado. El atleta completa trabajo
            significativo. El sistema registra el camino para que el progreso permanezca
            claro, constante y responsable.
          </p>
        </div>
      </div>
    </section>

    <section class="section pillars-section">
      <div class="section-shell">
        <div class="section-heading">
          <p class="eyebrow">
            <span data-lang-block="en">The Four Pillars</span>
            <span data-lang-block="es" class="hidden-lang">Los Cuatro Pilares</span>
          </p>

          <h2>
            <span data-lang-block="en">A Complete Athlete Requires More Than Technique</span>
            <span data-lang-block="es" class="hidden-lang">Un Atleta Completo Requiere Más Que Técnica</span>
          </h2>
        </div>

        <div class="pillars-layout">
          <div class="pillars-media">
            <img src="assets/images/sections/system-pillars.png" alt="The four pillars of the Sandman System" />
          </div>

          <div class="pillar-cards">
            <article>
              <span class="pillar-number">01</span>
              <h3>
                <span data-lang-block="en">Combat</span>
                <span data-lang-block="es" class="hidden-lang">Combate</span>
              </h3>
              <p>
                <span data-lang-block="en">
                  Skill, timing, pressure, decision-making, discipline, and composure.
                </span>
                <span data-lang-block="es" class="hidden-lang">
                  Habilidad, ritmo, presión, toma de decisiones, disciplina y serenidad.
                </span>
              </p>
            </article>

            <article>
              <span class="pillar-number">02</span>
              <h3>
                <span data-lang-block="en">Strength</span>
                <span data-lang-block="es" class="hidden-lang">Fuerza</span>
              </h3>
              <p>
                <span data-lang-block="en">
                  Physical capacity, resilience, movement confidence, and preparation.
                </span>
                <span data-lang-block="es" class="hidden-lang">
                  Capacidad física, resiliencia, confianza en el movimiento y preparación.
                </span>
              </p>
            </article>

            <article>
              <span class="pillar-number">03</span>
              <h3>
                <span data-lang-block="en">Honor</span>
                <span data-lang-block="es" class="hidden-lang">Honor</span>
              </h3>
              <p>
                <span data-lang-block="en">
                  Character, accountability, service, leadership, and responsibility.
                </span>
                <span data-lang-block="es" class="hidden-lang">
                  Carácter, responsabilidad, servicio, liderazgo y compromiso.
                </span>
              </p>
            </article>

            <article>
              <span class="pillar-number">04</span>
              <h3>
                <span data-lang-block="en">Conditioning</span>
                <span data-lang-block="es" class="hidden-lang">Acondicionamiento</span>
              </h3>
              <p>
                <span data-lang-block="en">
                  Readiness, work capacity, sustained effort, recovery, and endurance.
                </span>
                <span data-lang-block="es" class="hidden-lang">
                  Preparación, capacidad de trabajo, esfuerzo sostenido, recuperación y resistencia.
                </span>
              </p>
            </article>
          </div>
        </div>
      </div>
    </section>

    <section class="section engine-section">
      <div class="section-shell engine-grid">
        <div class="engine-copy">
          <p class="eyebrow">
            <span data-lang-block="en">The Progression Engine</span>
            <span data-lang-block="es" class="hidden-lang">El Motor de Progresión</span>
          </p>

          <h2>
            <span data-lang-block="en">Meaningful Experiences Become Visible Progress</span>
            <span data-lang-block="es" class="hidden-lang">Las Experiencias Significativas Se Convierten en Progreso Visible</span>
          </h2>

          <p class="lead">
            <span data-lang-block="en">
              Athletes earn progress through training, lessons, competition,
              strength work, honor missions, and other verified experiences.
            </span>

            <span data-lang-block="es" class="hidden-lang">
              Los atletas ganan progreso mediante entrenamiento, lecciones,
              competencia, trabajo de fuerza, misiones de honor y otras experiencias verificadas.
            </span>
          </p>

          <div class="engine-steps">
            <article>
              <span>1</span>
              <div>
                <h3>
                  <span data-lang-block="en">Experience</span>
                  <span data-lang-block="es" class="hidden-lang">Experiencia</span>
                </h3>
                <p>
                  <span data-lang-block="en">
                    The athlete trains, competes, learns, leads, or completes a mission.
                  </span>
                  <span data-lang-block="es" class="hidden-lang">
                    El atleta entrena, compite, aprende, lidera o completa una misión.
                  </span>
                </p>
              </div>
            </article>

            <article>
              <span>2</span>
              <div>
                <h3>
                  <span data-lang-block="en">Verification</span>
                  <span data-lang-block="es" class="hidden-lang">Verificación</span>
                </h3>
                <p>
                  <span data-lang-block="en">
                    The coach confirms that the experience was completed and meaningful.
                  </span>
                  <span data-lang-block="es" class="hidden-lang">
                    El entrenador confirma que la experiencia fue completada y tuvo valor.
                  </span>
                </p>
              </div>
            </article>

            <article>
              <span>3</span>
              <div>
                <h3>
                  <span data-lang-block="en">Progress</span>
                  <span data-lang-block="es" class="hidden-lang">Progreso</span>
                </h3>
                <p>
                  <span data-lang-block="en">
                    The system records growth toward the athlete’s next earned milestone.
                  </span>
                  <span data-lang-block="es" class="hidden-lang">
                    El sistema registra el crecimiento hacia el próximo logro ganado del atleta.
                  </span>
                </p>
              </div>
            </article>
          </div>
        </div>

        <div class="engine-media">
          <img src="assets/images/sections/system-progress.png" alt="Sandman progression system" />
        </div>
      </div>
    </section>

    <section class="section doctrine-section">
      <div class="section-shell doctrine-grid">
        <article>
          <p class="doctrine-label">
            <span data-lang-block="en">Doctrine 01</span>
            <span data-lang-block="es" class="hidden-lang">Doctrina 01</span>
          </p>
          <h3>
            <span data-lang-block="en">Lessons Are Earned</span>
            <span data-lang-block="es" class="hidden-lang">Las Lecciones Se Ganan</span>
          </h3>
          <p>
            <span data-lang-block="en">
              Athletes move forward when they are ready, not simply when time passes.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Los atletas avanzan cuando están preparados, no simplemente cuando pasa el tiempo.
            </span>
          </p>
        </article>

        <article>
          <p class="doctrine-label">
            <span data-lang-block="en">Doctrine 02</span>
            <span data-lang-block="es" class="hidden-lang">Doctrina 02</span>
          </p>
          <h3>
            <span data-lang-block="en">Character Is Currency</span>
            <span data-lang-block="es" class="hidden-lang">El Carácter Tiene Valor</span>
          </h3>
          <p>
            <span data-lang-block="en">
              Hard work and consistency determine progress.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El trabajo duro y la constancia determinan el progreso.
            </span>
          </p>
        </article>

        <article>
          <p class="doctrine-label">
            <span data-lang-block="en">Doctrine 03</span>
            <span data-lang-block="es" class="hidden-lang">Doctrina 03</span>
          </p>
          <h3>
            <span data-lang-block="en">The System Remembers</span>
            <span data-lang-block="es" class="hidden-lang">El Sistema lo Recuerda</span>
          </h3>
          <p>
            <span data-lang-block="en">
              Meaningful work should never disappear, be forgotten, or depend on memory alone.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El trabajo significativo nunca debe desaparecer, olvidarse ni depender solo de la memoria.
            </span>
          </p>
        </article>

        <article>
          <p class="doctrine-label">
            <span data-lang-block="en">Doctrine 04</span>
            <span data-lang-block="es" class="hidden-lang">Doctrina 04</span>
          </p>
          <h3>
            <span data-lang-block="en">Everyone Starts at Zero</span>
            <span data-lang-block="es" class="hidden-lang">Todos Comienzan en Cero</span>
          </h3>
          <p>
            <span data-lang-block="en">
              Status is not given. Every athlete earns the right to advance.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El estatus no se regala. Cada atleta se gana el derecho de avanzar.
            </span>
          </p>
        </article>
      </div>
    </section>

    <section class="section coach-role">
      <div class="section-shell coach-role-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">The Role of the Coach</span>
            <span data-lang-block="es" class="hidden-lang">El Papel del Entrenador</span>
          </p>

          <h2>
            <span data-lang-block="en">Technology Supports the Coach. It Does Not Replace the Coach.</span>
            <span data-lang-block="es" class="hidden-lang">
              La Tecnología Apoya al Entrenador. No Reemplaza al Entrenador.
            </span>
          </h2>
        </div>

        <div>
          <p class="lead">
            <span data-lang-block="en">
              The coach remains responsible for judgment, instruction, standards,
              relationships, readiness, and athlete care.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El entrenador sigue siendo responsable del juicio, la enseñanza,
              los estándares, las relaciones, la preparación y el cuidado del atleta.
            </span>
          </p>

          <p>
            <span data-lang-block="en">
              The system organizes information, preserves history, supports consistency,
              and makes progress visible. The human relationship remains at the center.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El sistema organiza la información, conserva el historial, apoya la constancia
              y hace visible el progreso. La relación humana permanece en el centro.
            </span>
          </p>
        </div>
      </div>
    </section>

    <section class="section final-cta">
      <div class="section-shell final-cta-panel">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">See the System in Action</span>
            <span data-lang-block="es" class="hidden-lang">Conoce el Sistema en Acción</span>
          </p>

          <h2>
            <span data-lang-block="en">Ready to Begin a Sandman Journey?</span>
            <span data-lang-block="es" class="hidden-lang">¿Listo Para Comenzar un Camino Sandman?</span>
          </h2>

          <p>
            <span data-lang-block="en">
              Connect with a coach and discover the right starting point.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Conéctate con un entrenador y descubre el punto de inicio correcto.
            </span>
          </p>
        </div>

        <a class="button button-primary" href="connect.html">
          <span data-lang-block="en">Connect With Sandman</span>
          <span data-lang-block="es" class="hidden-lang">Conéctate con Sandman</span>
        </a>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="section-shell footer-grid">
      <div>
        <a class="brand-link brand-link-footer" href="index.html">
          <span class="brand-mark" aria-hidden="true">S</span>
          <span class="brand-copy">
            <strong>Sandman</strong>
            <span>Combat</span>
          </span>
        </a>

        <p>
          <span data-lang-block="en">Combat is the classroom. Character is the curriculum.</span>
          <span data-lang-block="es" class="hidden-lang">
            El combate es el salón de clases. El carácter es el currículo.
          </span>
        </p>
      </div>

      <nav class="footer-nav" aria-label="Footer navigation">
        <a href="about.html">
          <span data-lang-block="en">About</span>
          <span data-lang-block="es" class="hidden-lang">Nosotros</span>
        </a>
        <a href="journeys.html">
          <span data-lang-block="en">Journeys</span>
          <span data-lang-block="es" class="hidden-lang">Caminos</span>
        </a>
        <a href="system.html">
          <span data-lang-block="en">The System</span>
          <span data-lang-block="es" class="hidden-lang">El Sistema</span>
        </a>
        <a href="connect.html">
          <span data-lang-block="en">Connect</span>
          <span data-lang-block="es" class="hidden-lang">Conéctate</span>
        </a>
      </nav>
    </div>

    <div class="section-shell footer-bottom">
      <p>© <span data-current-year></span> Sandman Combat™</p>
      <p>
        <span data-lang-block="en">Heroes build heroes.</span>
        <span data-lang-block="es" class="hidden-lang">Los héroes forman héroes.</span>
      </p>
    </div>
  </footer>

  <script>
    const navToggle = document.querySelector(".nav-toggle");
    const primaryNav = document.querySelector(".primary-nav");

    if (navToggle && primaryNav) {
      navToggle.addEventListener("click", () => {
        const isOpen = navToggle.getAttribute("aria-expanded") === "true";
        navToggle.setAttribute("aria-expanded", String(!isOpen));
        primaryNav.classList.toggle("is-open", !isOpen);
      });
    }

    document.querySelectorAll("[data-current-year]").forEach((element) => {
      element.textContent = new Date().getFullYear();
    });
  </script>
</body>
</html>
"""

CSS = r"""/* =========================================================
   Sandman Combat — Public Next System
========================================================= */

.system-hero {
  position: relative;
  display: grid;
  min-height: 820px;
  align-items: end;
  overflow: hidden;
  background: #050505;
}

.system-hero-media,
.system-hero-overlay {
  position: absolute;
  inset: 0;
}

.system-hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.system-hero-overlay {
  background:
    linear-gradient(90deg, rgba(0,0,0,.94), rgba(0,0,0,.62) 54%, rgba(0,0,0,.16)),
    linear-gradient(0deg, rgba(0,0,0,.95), transparent 56%);
}

.system-hero-content {
  position: relative;
  z-index: 2;
  padding-top: 10rem;
  padding-bottom: 6rem;
}

.system-hero h1 {
  max-width: 1050px;
  margin: 0;
  color: #fff;
  font-size: clamp(3.2rem, 7.5vw, 7rem);
  line-height: .93;
  letter-spacing: -.055em;
}

.system-hero h1 strong {
  color: var(--brand-red-bright, #d11f27);
}

.hero-lead {
  max-width: 780px;
  margin-top: 1.6rem;
  color: rgba(255,255,255,.84);
  font-size: clamp(1.08rem, 2vw, 1.4rem);
  line-height: 1.65;
}

.intro-grid,
.coach-role-grid {
  display: grid;
  grid-template-columns: minmax(0,.92fr) minmax(0,1.08fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: start;
}

.pillars-section {
  background: var(--surface-deep, #0b0b0c);
}

.pillars-layout {
  display: grid;
  grid-template-columns: minmax(0,.85fr) minmax(0,1.15fr);
  gap: clamp(2rem, 6vw, 6rem);
  align-items: center;
  margin-top: 2.5rem;
}

.pillars-media,
.engine-media {
  overflow: hidden;
  min-height: 600px;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 24px;
  background: #080808;
}

.pillars-media img,
.engine-media img {
  width: 100%;
  height: 100%;
  min-height: inherit;
  object-fit: cover;
}

.pillar-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: .9rem;
}

.pillar-cards article,
.doctrine-grid article {
  padding: 1.35rem;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 18px;
  background: var(--surface, #111113);
}

.pillar-number,
.doctrine-label {
  display: block;
  margin-bottom: 1.8rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: .72rem;
  font-weight: 900;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.pillar-cards h3,
.doctrine-grid h3 {
  margin: 0 0 .6rem;
}

.pillar-cards p,
.doctrine-grid p {
  margin: 0;
  color: var(--text-soft, #d4d4d7);
}

.engine-grid {
  display: grid;
  grid-template-columns: minmax(0,1.1fr) minmax(0,.9fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: center;
}

.engine-steps {
  display: grid;
  gap: .8rem;
  margin-top: 1.6rem;
}

.engine-steps article {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--line, rgba(255,255,255,.12));
}

.engine-steps article > span {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgba(205,31,39,.54);
  border-radius: 50%;
  color: var(--brand-red-bright, #d11f27);
  font-weight: 900;
}

.engine-steps h3 {
  margin: 0 0 .3rem;
}

.engine-steps p {
  margin: 0;
  color: var(--text-soft, #d4d4d7);
}

.doctrine-section {
  background:
    radial-gradient(circle at 50% 20%, rgba(181,18,25,.12), transparent 32%),
    var(--surface-deep, #0b0b0c);
}

.doctrine-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: .9rem;
}

.coach-role {
  background: linear-gradient(100deg, #f2f2f2, #dcdcdc);
  color: #111;
}

.coach-role .eyebrow {
  color: #b51219;
}

.coach-role h2 {
  color: #111;
}

.coach-role p {
  color: #2e2e2e;
}

.final-cta {
  padding-top: 2rem;
}

.final-cta-panel {
  display: grid;
  grid-template-columns: minmax(0,1fr) auto;
  gap: 2rem;
  align-items: center;
  padding: clamp(1.6rem, 4vw, 3rem);
  border: 1px solid rgba(181,18,25,.48);
  border-radius: 24px;
  background:
    linear-gradient(110deg, rgba(181,18,25,.14), transparent),
    var(--surface, #111113);
}

.final-cta-panel p {
  margin-bottom: 0;
}

@media (max-width: 1050px) {
  .intro-grid,
  .pillars-layout,
  .engine-grid,
  .coach-role-grid {
    grid-template-columns: 1fr;
  }

  .doctrine-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .pillars-media,
  .engine-media {
    min-height: 480px;
  }
}

@media (max-width: 700px) {
  .system-hero {
    min-height: 760px;
  }

  .system-hero h1 {
    font-size: clamp(3rem, 14vw, 5rem);
  }

  .pillar-cards,
  .doctrine-grid,
  .final-cta-panel {
    grid-template-columns: 1fr;
  }

  .pillars-media,
  .engine-media {
    min-height: 390px;
  }

  .final-cta-panel .button {
    width: 100%;
  }
}
"""


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"✅ Wrote {path.relative_to(ROOT)}")


def main() -> None:
    PUBLIC_NEXT.mkdir(parents=True, exist_ok=True)

    write_file(HTML_FILE, HTML)
    write_file(CSS_FILE, CSS)

    print()
    print("System page build complete.")
    print()
    print("Image paths already wired:")
    print("  assets/images/hero/hero-system-en.png")
    print("  assets/images/hero/hero-system-es.png")
    print("  assets/images/sections/system-pillars.png")
    print("  assets/images/sections/system-progress.png")


if __name__ == "__main__":
    main()
