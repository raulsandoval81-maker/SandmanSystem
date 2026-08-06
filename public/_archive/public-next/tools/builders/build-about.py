#!/usr/bin/env python3
"""
Build the Sandman Combat public-next About page.

Run from the SandmanSystem project root:

    python3 build-public-next-about.py

Creates or replaces:

    public-next/about.html
    public-next/assets/css/about.css

Expected image files:

    public-next/assets/images/hero/hero-about-en.png
    public-next/assets/images/hero/hero-about-es.png
    public-next/assets/images/sections/about-story-en.png
    public-next/assets/images/sections/about-story-es.png

The Spanish image files may be added later. Their placement is already wired.
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC_NEXT = ROOT / "public-next"
ABOUT_FILE = PUBLIC_NEXT / "about.html"
ABOUT_CSS_FILE = PUBLIC_NEXT / "assets" / "css" / "about.css"

ABOUT_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>About Sandman Combat™ | Built Different</title>

  <meta
    name="description"
    content="Discover why Sandman Combat exists, the mission behind the system, and the philosophy guiding athlete development through Combat, Strength, and Honor."
  />

  <link rel="stylesheet" href="assets/css/site.css" />
  <link rel="stylesheet" href="assets/css/about.css" />

  <script src="assets/js/language.js" defer></script>
  <script src="assets/js/theme.js" defer></script>
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
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav id="primary-navigation" class="primary-nav" aria-label="Primary navigation">
        <a href="index.html">
          <span data-lang-block="en">Home</span>
          <span data-lang-block="es" class="hidden-lang">Inicio</span>
        </a>

        <a href="about.html" aria-current="page">
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
          <button type="button" class="language-button is-active" data-language-button="en">
            EN
          </button>
          <button type="button" class="language-button" data-language-button="es">
            ES
          </button>
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
    <section class="about-hero" aria-labelledby="about-page-title">
      <h1 id="about-page-title" class="sr-only">
        <span data-lang-block="en">Built Different</span>
        <span data-lang-block="es" class="hidden-lang">Construidos Diferentes</span>
      </h1>

      <div class="about-image-frame">
        <img
          class="about-image"
          src="assets/images/hero/hero-about-en.png"
          alt="Sandman Combat athletes standing behind a focused athlete under the words Built Different"
          data-lang-block="en"
        />

        <img
          class="about-image hidden-lang"
          src="assets/images/hero/hero-about-es.png"
          alt="Atletas de Sandman Combat bajo el mensaje Construidos Diferentes"
          data-lang-block="es"
        />
      </div>
    </section>

    <section class="section about-opening">
      <div class="section-shell opening-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">Why Sandman Exists</span>
            <span data-lang-block="es" class="hidden-lang">Por Qué Existe Sandman</span>
          </p>

          <h2>
            <span data-lang-block="en">Built Different Is More Than a Slogan</span>
            <span data-lang-block="es" class="hidden-lang">
              Construidos Diferentes Es Más Que un Eslogan
            </span>
          </h2>
        </div>

        <div class="opening-copy">
          <div data-lang-block="en">
            <p class="lead">
              Sandman Combat was created from a simple belief: combat can develop
              far more than athletes.
            </p>

            <p>
              When training is taught with purpose, it becomes a classroom for
              confidence, discipline, resilience, leadership, and character.
              Every lesson, every drill, and every challenge should prepare people
              not only for competition, but for life.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Sandman Combat nació de una creencia sencilla: el combate puede
              desarrollar mucho más que atletas.
            </p>

            <p>
              Cuando el entrenamiento se enseña con propósito, se convierte en un
              salón de clases para la confianza, la disciplina, la resiliencia, el
              liderazgo y el carácter. Cada lección, cada ejercicio y cada desafío
              debe preparar a las personas no solo para competir, sino para la vida.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="about-story-art" aria-labelledby="about-story-heading">
      <h2 id="about-story-heading" class="sr-only">
        <span data-lang-block="en">Built in the Shadows. Raised for More.</span>
        <span data-lang-block="es" class="hidden-lang">
          Construido en las Sombras. Formado para Más.
        </span>
      </h2>

      <div class="about-image-frame">
        <img
          class="about-image"
          src="assets/images/sections/about-story-en.png"
          alt="The Sandman Combat origin story, mission, vision, philosophy, and founder"
          data-lang-block="en"
        />

        <img
          class="about-image hidden-lang"
          src="assets/images/sections/about-story-es.png"
          alt="La historia, misión, visión, filosofía y fundador de Sandman Combat"
          data-lang-block="es"
        />
      </div>
    </section>

    <section class="section origin-section">
      <div class="section-shell story-grid">
        <div class="story-heading">
          <p class="eyebrow">
            <span data-lang-block="en">Our Story</span>
            <span data-lang-block="es" class="hidden-lang">Nuestra Historia</span>
          </p>

          <h2>
            <span data-lang-block="en">Built in the Shadows. Raised for More.</span>
            <span data-lang-block="es" class="hidden-lang">
              Construido en las Sombras. Formado para Más.
            </span>
          </h2>
        </div>

        <div class="story-copy">
          <div data-lang-block="en">
            <p class="lead">
              Sandman was built through years of unseen work—early mornings, late
              nights, lessons learned, failures endured, and victories earned.
            </p>

            <p>
              Long before the name was public, the foundation was being formed
              through coaching, service, sacrifice, and an unwavering belief in
              what young people can become when someone holds the standard and
              refuses to give up on them.
            </p>

            <p>
              This is more than a gym. It is a development system, a community,
              and a legacy in motion.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Sandman fue construido durante años de trabajo invisible: mañanas
              tempranas, noches largas, lecciones aprendidas, fracasos superados
              y victorias ganadas.
            </p>

            <p>
              Mucho antes de que el nombre fuera público, la base ya se estaba
              formando mediante entrenamiento, servicio, sacrificio y una fe
              inquebrantable en lo que los jóvenes pueden llegar a ser cuando
              alguien sostiene el estándar y se niega a rendirse con ellos.
            </p>

            <p>
              Esto es más que un gimnasio. Es un sistema de desarrollo, una
              comunidad y un legado en movimiento.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="section mission-vision-section">
      <div class="section-shell mission-vision-grid">
        <article class="purpose-card">
          <p class="eyebrow">
            <span data-lang-block="en">Our Mission</span>
            <span data-lang-block="es" class="hidden-lang">Nuestra Misión</span>
          </p>

          <h2>
            <span data-lang-block="en">Develop the Whole Person</span>
            <span data-lang-block="es" class="hidden-lang">Desarrollar a la Persona Completa</span>
          </h2>

          <p data-lang-block="en">
            To develop confident individuals through world-class combat sports
            instruction, character development, and a culture built on Combat,
            Strength, and Honor.
          </p>

          <p data-lang-block="es" class="hidden-lang">
            Desarrollar personas seguras de sí mismas mediante instrucción de
            deportes de combate de alto nivel, formación del carácter y una
            cultura basada en Combate, Fuerza y Honor.
          </p>
        </article>

        <article class="purpose-card">
          <p class="eyebrow">
            <span data-lang-block="en">Our Vision</span>
            <span data-lang-block="es" class="hidden-lang">Nuestra Visión</span>
          </p>

          <h2>
            <span data-lang-block="en">Set a New Standard</span>
            <span data-lang-block="es" class="hidden-lang">Establecer un Nuevo Estándar</span>
          </h2>

          <p data-lang-block="en">
            To redefine what a combat sports academy can be—creating a standard
            where every athlete becomes stronger in skill, stronger in character,
            and stronger in life.
          </p>

          <p data-lang-block="es" class="hidden-lang">
            Redefinir lo que puede ser una academia de deportes de combate,
            creando un estándar donde cada atleta sea más fuerte en habilidad,
            más fuerte en carácter y más fuerte en la vida.
          </p>
        </article>
      </div>
    </section>

    <section class="section philosophy-section">
      <div class="section-shell philosophy-grid">
        <div class="philosophy-mark" aria-hidden="true">
          <span>三</span>
        </div>

        <div class="philosophy-copy">
          <p class="eyebrow">
            <span data-lang-block="en">Our Philosophy</span>
            <span data-lang-block="es" class="hidden-lang">Nuestra Filosofía</span>
          </p>

          <h2>
            <span data-lang-block="en">
              Combat Is the Classroom.<br />
              <strong>Character Is the Curriculum.</strong>
            </span>

            <span data-lang-block="es" class="hidden-lang">
              El Combate Es el Salón de Clases.<br />
              <strong>El Carácter Es el Currículo.</strong>
            </span>
          </h2>

          <div data-lang-block="en">
            <p class="lead">
              We do not just train athletes. We develop human beings.
            </p>

            <p>
              The lessons learned through challenge—discipline, resilience,
              respect, accountability, composure, and leadership—should appear
              everywhere an athlete goes.
            </p>

            <p class="philosophy-close">
              Stronger in here. Better out there.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              No solo entrenamos atletas. Desarrollamos seres humanos.
            </p>

            <p>
              Las lecciones aprendidas a través del desafío—disciplina,
              resiliencia, respeto, responsabilidad, control y liderazgo—deben
              reflejarse en cada lugar al que vaya el atleta.
            </p>

            <p class="philosophy-close">
              Más fuertes aquí. Mejores allá afuera.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="section standards-section">
      <div class="section-shell">
        <div class="section-heading section-heading-left">
          <p class="eyebrow">
            <span data-lang-block="en">What Makes Sandman Different</span>
            <span data-lang-block="es" class="hidden-lang">Lo Que Hace Diferente a Sandman</span>
          </p>

          <h2>
            <span data-lang-block="en">A Standard Built Into the Experience</span>
            <span data-lang-block="es" class="hidden-lang">
              Un Estándar Integrado en la Experiencia
            </span>
          </h2>
        </div>

        <div class="standard-grid">
          <article class="standard-card">
            <span class="standard-number">01</span>
            <h3>
              <span data-lang-block="en">Coach-Led Progression</span>
              <span data-lang-block="es" class="hidden-lang">
                Progresión Guiada por el Entrenador
              </span>
            </h3>

            <p data-lang-block="en">
              Every athlete is guided by a coach who knows their name, their
              story, their needs, and their potential.
            </p>

            <p data-lang-block="es" class="hidden-lang">
              Cada atleta es guiado por un entrenador que conoce su nombre, su
              historia, sus necesidades y su potencial.
            </p>
          </article>

          <article class="standard-card">
            <span class="standard-number">02</span>
            <h3>
              <span data-lang-block="en">Earned Advancement</span>
              <span data-lang-block="es" class="hidden-lang">Avance Ganado</span>
            </h3>

            <p data-lang-block="en">
              There are no shortcuts. Lessons, milestones, recognition, and
              responsibility are earned through consistent work and proven growth.
            </p>

            <p data-lang-block="es" class="hidden-lang">
              No hay atajos. Las lecciones, los logros, el reconocimiento y la
              responsabilidad se ganan mediante trabajo constante y crecimiento
              demostrado.
            </p>
          </article>

          <article class="standard-card">
            <span class="standard-number">03</span>
            <h3>
              <span data-lang-block="en">Character First</span>
              <span data-lang-block="es" class="hidden-lang">El Carácter Primero</span>
            </h3>

            <p data-lang-block="en">
              Skill matters, but character is currency. Integrity, consistency,
              leadership, and service shape the person behind the athlete.
            </p>

            <p data-lang-block="es" class="hidden-lang">
              La habilidad importa, pero el carácter tiene valor. La integridad,
              la constancia, el liderazgo y el servicio forman a la persona detrás
              del atleta.
            </p>
          </article>

          <article class="standard-card">
            <span class="standard-number">04</span>
            <h3>
              <span data-lang-block="en">Built for Life</span>
              <span data-lang-block="es" class="hidden-lang">Formado para la Vida</span>
            </h3>

            <p data-lang-block="en">
              The lessons developed through training create strength, confidence,
              discipline, and purpose that last beyond the mat.
            </p>

            <p data-lang-block="es" class="hidden-lang">
              Las lecciones desarrolladas mediante el entrenamiento crean fuerza,
              confianza, disciplina y propósito que permanecen más allá del área
              de entrenamiento.
            </p>
          </article>
        </div>
      </div>
    </section>

    <section class="section founder-section">
      <div class="section-shell founder-grid">
        <div class="founder-portrait" aria-hidden="true">
          <div class="founder-monogram">RS</div>
        </div>

        <div class="founder-copy">
          <p class="eyebrow">
            <span data-lang-block="en">From the Founder</span>
            <span data-lang-block="es" class="hidden-lang">Del Fundador</span>
          </p>

          <h2>Coach Sandoval</h2>

          <div data-lang-block="en">
            <p class="lead">
              Coach. Mentor. Builder. A lifelong student of combat and the human mind.
            </p>

            <p>
              Sandman is the product of years spent teaching athletes, studying
              development, building systems, and searching for a better way to
              help people grow.
            </p>

            <p>
              The mission is simple: develop people, build champions, and leave
              every room, family, team, and community stronger than it was found.
            </p>

            <p class="founder-signoff">
              Still building. Still teaching. Still becoming.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Entrenador. Mentor. Constructor. Estudiante de por vida del combate
              y de la mente humana.
            </p>

            <p>
              Sandman es el resultado de años enseñando a atletas, estudiando el
              desarrollo, construyendo sistemas y buscando una mejor manera de
              ayudar a las personas a crecer.
            </p>

            <p>
              La misión es sencilla: desarrollar personas, formar campeones y
              dejar cada espacio, familia, equipo y comunidad más fuerte de como
              se encontró.
            </p>

            <p class="founder-signoff">
              Seguimos construyendo. Seguimos enseñando. Seguimos creciendo.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="section future-section">
      <div class="section-shell future-panel">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">The Future</span>
            <span data-lang-block="es" class="hidden-lang">El Futuro</span>
          </p>

          <h2>
            <span data-lang-block="en">One Athlete. One Family. One City at a Time.</span>
            <span data-lang-block="es" class="hidden-lang">
              Un Atleta. Una Familia. Una Ciudad a la Vez.
            </span>
          </h2>

          <p>
            <span data-lang-block="en">
              Sandman is being built to serve deeply before it grows broadly.
              The goal is not simply to open more academies. It is to create a
              repeatable culture where coaches can teach, athletes can earn, and
              communities can become stronger.
            </span>

            <span data-lang-block="es" class="hidden-lang">
              Sandman se está construyendo para servir profundamente antes de
              crecer ampliamente. La meta no es simplemente abrir más academias.
              Es crear una cultura repetible donde los entrenadores puedan enseñar,
              los atletas puedan ganarse su progreso y las comunidades puedan
              fortalecerse.
            </span>
          </p>
        </div>

        <a class="button button-primary" href="journeys.html">
          <span data-lang-block="en">Explore the Journeys</span>
          <span data-lang-block="es" class="hidden-lang">Explora los Caminos</span>
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
          <span data-lang-block="en">
            Combat is the classroom. Character is the curriculum.
          </span>
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
        <span data-lang-block="en">Built in the shadows. Raised for more.</span>
        <span data-lang-block="es" class="hidden-lang">
          Construido en las sombras. Formado para más.
        </span>
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

ABOUT_CSS = r"""/* =========================================================
   Sandman Combat — Public Next About
   File: public-next/assets/css/about.css
========================================================= */

.about-hero,
.about-story-art {
  background: #050505;
}

.about-image-frame {
  width: 100%;
  overflow: hidden;
}

.about-image {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}

.about-opening {
  position: relative;
  overflow: hidden;
}

.about-opening::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: var(--brand-red, #b51219);
}

.opening-grid,
.story-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: start;
}

.opening-grid h2,
.story-grid h2 {
  max-width: 12ch;
}

.opening-copy,
.story-copy {
  max-width: 760px;
}

.origin-section {
  background:
    radial-gradient(circle at 86% 38%, rgba(181, 18, 25, 0.15), transparent 34%),
    var(--surface-deep, #0b0b0c);
}

.mission-vision-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.12));
}

.purpose-card {
  min-height: 360px;
  padding: clamp(1.8rem, 5vw, 4rem);
}

.purpose-card:first-child {
  border-right: 1px solid var(--line, rgba(255, 255, 255, 0.12));
}

.purpose-card h2 {
  margin-bottom: 1.25rem;
  font-size: clamp(2.1rem, 5vw, 4rem);
}

.purpose-card p:last-child {
  max-width: 620px;
  color: var(--text-soft, #d6d6d8);
  font-size: clamp(1.02rem, 1.8vw, 1.2rem);
  line-height: 1.75;
}

.philosophy-section {
  background:
    linear-gradient(100deg, rgba(255, 255, 255, 0.96), rgba(224, 224, 224, 0.93));
  color: #111;
}

.philosophy-grid {
  display: grid;
  grid-template-columns: minmax(220px, 0.55fr) minmax(0, 1.45fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: center;
}

.philosophy-mark {
  display: grid;
  width: min(280px, 74vw);
  aspect-ratio: 1;
  place-items: center;
  border: 14px solid rgba(0, 0, 0, 0.82);
  border-radius: 50%;
  font-size: clamp(4rem, 12vw, 9rem);
  font-weight: 900;
}

.philosophy-section .eyebrow {
  color: #b51219;
}

.philosophy-copy h2 {
  margin-bottom: 1.4rem;
  color: #111;
  font-size: clamp(2.2rem, 5vw, 4.9rem);
  line-height: 0.96;
}

.philosophy-copy h2 strong {
  color: #b51219;
}

.philosophy-copy p {
  max-width: 780px;
  color: #252525;
}

.philosophy-close {
  color: #b51219 !important;
  font-weight: 900;
}

.standards-section {
  background:
    linear-gradient(rgba(255, 255, 255, 0.018), rgba(255, 255, 255, 0.018)),
    var(--surface-deep, #0b0b0c);
}

.standard-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 2.5rem;
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.12));
}

.standard-card {
  padding: clamp(1.5rem, 3vw, 2.5rem);
  border-right: 1px solid var(--line, rgba(255, 255, 255, 0.12));
}

.standard-card:last-child {
  border-right: 0;
}

.standard-number {
  display: block;
  margin-bottom: 2.5rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.18em;
}

.standard-card h3 {
  min-height: 2.4em;
  margin: 0 0 1rem;
  font-size: clamp(1.35rem, 2vw, 1.8rem);
}

.standard-card p {
  margin: 0;
  color: var(--text-soft, #d6d6d8);
  line-height: 1.7;
}

.founder-section {
  position: relative;
  overflow: hidden;
}

.founder-section::after {
  content: "";
  position: absolute;
  right: -130px;
  bottom: -130px;
  width: 420px;
  aspect-ratio: 1;
  border: 1px solid rgba(181, 18, 25, 0.3);
  border-radius: 50%;
  box-shadow:
    0 0 0 55px rgba(181, 18, 25, 0.04),
    0 0 0 110px rgba(181, 18, 25, 0.025);
  pointer-events: none;
}

.founder-grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.25fr);
  gap: clamp(2.5rem, 7vw, 7rem);
  align-items: center;
}

.founder-portrait {
  display: grid;
  min-height: 510px;
  place-items: center;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 40%, rgba(181, 18, 25, 0.22), transparent 36%),
    linear-gradient(145deg, #151517, #080809);
}

.founder-monogram {
  display: grid;
  width: 190px;
  aspect-ratio: 1;
  place-items: center;
  border: 2px solid rgba(205, 31, 39, 0.75);
  border-radius: 50%;
  color: #f4f4f4;
  font-size: 4rem;
  font-weight: 950;
  letter-spacing: -0.08em;
}

.founder-copy {
  max-width: 760px;
}

.founder-copy h2 {
  margin-bottom: 1rem;
  font-size: clamp(2.5rem, 6vw, 5rem);
}

.founder-signoff {
  color: var(--brand-red-bright, #d11f27) !important;
  font-weight: 900;
}

.future-section {
  padding-top: clamp(2rem, 6vw, 5rem);
}

.future-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: center;
  padding: clamp(1.75rem, 5vw, 3.75rem);
  border: 1px solid rgba(205, 31, 39, 0.55);
  border-radius: 24px;
  background:
    linear-gradient(110deg, rgba(181, 18, 25, 0.15), rgba(255, 255, 255, 0.018)),
    var(--surface, #101012);
}

.future-panel h2 {
  margin-bottom: 0.75rem;
}

.future-panel p {
  max-width: 850px;
  margin: 0;
  color: var(--text-soft, #d6d6d8);
}

@media (max-width: 1050px) {
  .standard-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .standard-card:nth-child(2) {
    border-right: 0;
  }

  .standard-card:nth-child(-n + 2) {
    border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  }
}

@media (max-width: 900px) {
  .opening-grid,
  .story-grid,
  .philosophy-grid,
  .founder-grid {
    grid-template-columns: 1fr;
  }

  .opening-grid h2,
  .story-grid h2 {
    max-width: none;
  }

  .mission-vision-grid {
    grid-template-columns: 1fr;
  }

  .purpose-card:first-child {
    border-right: 0;
    border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  }

  .philosophy-mark {
    width: min(220px, 65vw);
  }

  .founder-portrait {
    min-height: 360px;
  }

  .future-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 650px) {
  .about-hero .about-image {
    min-height: 500px;
    object-position: 60% center;
  }

  .about-story-art .about-image {
    min-height: 720px;
    object-position: center top;
  }

  .standard-grid {
    grid-template-columns: 1fr;
  }

  .standard-card,
  .standard-card:nth-child(2) {
    border-right: 0;
    border-bottom: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  }

  .standard-card:last-child {
    border-bottom: 0;
  }

  .future-panel .button {
    width: 100%;
  }
}
"""


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"✅ Wrote {path.relative_to(ROOT)}")


def main() -> None:
    if not PUBLIC_NEXT.exists():
        PUBLIC_NEXT.mkdir(parents=True)
        print("✅ Created public-next/")

    write_file(ABOUT_FILE, ABOUT_HTML)
    write_file(ABOUT_CSS_FILE, ABOUT_CSS)

    print()
    print("About page build complete.")
    print()
    print("Image paths already wired:")
    print("  assets/images/hero/hero-about-en.png")
    print("  assets/images/hero/hero-about-es.png")
    print("  assets/images/sections/about-story-en.png")
    print("  assets/images/sections/about-story-es.png")


if __name__ == "__main__":
    main()
