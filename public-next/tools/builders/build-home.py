#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Home page.

Run from the SandmanSystem project root:

    python3 public-next/tools/builders/build-home.py

Creates or replaces:

    public-next/index.html
    public-next/assets/css/home.css

Expected image files:

    public-next/assets/images/hero/hero-home-en.png
    public-next/assets/images/hero/hero-home-es.png
    public-next/assets/images/journeys/zero2hero-home.png
    public-next/assets/images/journeys/path2legend-home.png
    public-next/assets/images/journeys/quest2mastery-home.png
    public-next/assets/images/sections/home-system.png
    public-next/assets/images/sections/home-impact.png

Spanish hero artwork may be added later. Its placement is already wired.
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC_NEXT = ROOT / "public-next"
HOME_FILE = PUBLIC_NEXT / "index.html"
HOME_CSS_FILE = PUBLIC_NEXT / "assets" / "css" / "home.css"

HOME_HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Sandman Combat™ | Combat Is the Classroom</title>

  <meta
    name="description"
    content="Sandman Combat develops athletes through combat sports, strength, honor, conditioning, and earned progression. Explore youth, teen, adult, and future MMA journeys."
  />

  <link rel="stylesheet" href="assets/css/site.css" />
  <link rel="stylesheet" href="assets/css/home.css" />

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
        <span></span>
        <span></span>
        <span></span>
      </button>

      <nav id="primary-navigation" class="primary-nav" aria-label="Primary navigation">
        <a href="index.html" aria-current="page">
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
    <section class="home-hero" aria-labelledby="home-title">
      <div class="home-hero-media" aria-hidden="true">
        <img
          src="assets/images/hero/hero-home-en.png"
          alt=""
          data-lang-block="en"
        />

        <img
          src="assets/images/hero/hero-home-es.png"
          alt=""
          data-lang-block="es"
          class="hidden-lang"
        />
      </div>

      <div class="home-hero-overlay"></div>

      <div class="section-shell home-hero-content">
        <p class="hero-kicker">
          <span data-lang-block="en">Sandman Combat™</span>
          <span data-lang-block="es" class="hidden-lang">Sandman Combat™</span>
        </p>

        <h1 id="home-title">
          <span data-lang-block="en">
            Combat Is the Classroom.<br />
            <strong>Character Is the Curriculum.</strong>
          </span>

          <span data-lang-block="es" class="hidden-lang">
            El Combate Es el Salón de Clases.<br />
            <strong>El Carácter Es el Currículo.</strong>
          </span>
        </h1>

        <p class="hero-lead">
          <span data-lang-block="en">
            Purpose-driven combat sports training built to develop skill,
            confidence, discipline, strength, and character.
          </span>

          <span data-lang-block="es" class="hidden-lang">
            Entrenamiento de deportes de combate con propósito, diseñado para
            desarrollar habilidad, confianza, disciplina, fuerza y carácter.
          </span>
        </p>

        <div class="hero-actions">
          <a class="button button-primary" href="journeys.html">
            <span data-lang-block="en">Choose Your Journey</span>
            <span data-lang-block="es" class="hidden-lang">Elige Tu Camino</span>
          </a>

          <a class="button button-secondary" href="about.html">
            <span data-lang-block="en">Why Sandman Exists</span>
            <span data-lang-block="es" class="hidden-lang">Por Qué Existe Sandman</span>
          </a>
        </div>
      </div>

      <div class="hero-scroll-cue" aria-hidden="true">
        <span></span>
      </div>
    </section>

    <section class="section home-intro">
      <div class="section-shell intro-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">Built Different</span>
            <span data-lang-block="es" class="hidden-lang">Construidos Diferentes</span>
          </p>

          <h2>
            <span data-lang-block="en">
              We Do Not Just Train Athletes.<br />
              <strong>We Build Heroes.</strong>
            </span>

            <span data-lang-block="es" class="hidden-lang">
              No Solo Entrenamos Atletas.<br />
              <strong>Formamos Héroes.</strong>
            </span>
          </h2>
        </div>

        <div class="intro-copy">
          <div data-lang-block="en">
            <p class="lead">
              Sandman Combat is a coach-led development system where every athlete
              earns progress through consistent work, meaningful experiences, and
              proven growth.
            </p>

            <p>
              Combat develops competence. Strength builds capacity. Honor shapes
              character. Conditioning prepares athletes to perform when it matters.
              Together, they create a complete path for long-term development.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Sandman Combat es un sistema de desarrollo guiado por entrenadores,
              donde cada atleta gana su progreso mediante trabajo constante,
              experiencias significativas y crecimiento demostrado.
            </p>

            <p>
              El Combate desarrolla competencia. La Fuerza crea capacidad. El Honor
              forma el carácter. El Acondicionamiento prepara a los atletas para
              rendir cuando más importa. Juntos, crean un camino completo de
              desarrollo a largo plazo.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="section journeys-preview">
      <div class="section-shell">
        <div class="section-heading">
          <p class="eyebrow">
            <span data-lang-block="en">Choose Your Journey</span>
            <span data-lang-block="es" class="hidden-lang">Elige Tu Camino</span>
          </p>

          <h2>
            <span data-lang-block="en">Every Athlete Begins Somewhere</span>
            <span data-lang-block="es" class="hidden-lang">Cada Atleta Comienza en Algún Lugar</span>
          </h2>

          <p>
            <span data-lang-block="en">
              Age, experience, and goals may differ. The standard does not.
            </span>

            <span data-lang-block="es" class="hidden-lang">
              La edad, la experiencia y las metas pueden variar. El estándar no.
            </span>
          </p>
        </div>

        <div class="journey-grid">
          <article class="journey-card journey-card-silver">
            <div class="journey-card-media">
              <img
                src="assets/images/journeys/zero2hero-home.png"
                alt="Zero2Hero youth journey artwork"
              />
            </div>

            <div class="journey-card-body">
              <p class="journey-age">
                <span data-lang-block="en">Ages 6–13</span>
                <span data-lang-block="es" class="hidden-lang">Edades 6–13</span>
              </p>

              <h3>Zero2Hero™</h3>

              <p data-lang-block="en">
                A youth journey designed to build confidence, discipline,
                coordination, courage, and character through age-appropriate
                combat sports development.
              </p>

              <p data-lang-block="es" class="hidden-lang">
                Un camino juvenil diseñado para desarrollar confianza, disciplina,
                coordinación, valor y carácter mediante deportes de combate
                apropiados para la edad.
              </p>

              <ul class="journey-list">
                <li>
                  <span data-lang-block="en">Wrestling</span>
                  <span data-lang-block="es" class="hidden-lang">Lucha</span>
                </li>
                <li>
                  <span data-lang-block="en">Kickboxing</span>
                  <span data-lang-block="es" class="hidden-lang">Kickboxing</span>
                </li>
              </ul>

              <a class="text-link" href="journeys.html#zero2hero">
                <span data-lang-block="en">Explore Zero2Hero</span>
                <span data-lang-block="es" class="hidden-lang">Explora Zero2Hero</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </article>

          <article class="journey-card journey-card-gold">
            <div class="journey-card-media">
              <img
                src="assets/images/journeys/path2legend-home.png"
                alt="Path2Legend teen and adult journey artwork"
              />
            </div>

            <div class="journey-card-body">
              <p class="journey-age">
                <span data-lang-block="en">Ages 14+</span>
                <span data-lang-block="es" class="hidden-lang">Edades 14+</span>
              </p>

              <h3>Path2Legend™</h3>

              <p data-lang-block="en">
                A teen and adult journey for athletes ready to train with greater
                purpose, accountability, leadership, and long-term commitment.
              </p>

              <p data-lang-block="es" class="hidden-lang">
                Un camino para adolescentes y adultos preparados para entrenar con
                mayor propósito, responsabilidad, liderazgo y compromiso a largo plazo.
              </p>

              <ul class="journey-list">
                <li>
                  <span data-lang-block="en">Wrestling</span>
                  <span data-lang-block="es" class="hidden-lang">Lucha</span>
                </li>
                <li>
                  <span data-lang-block="en">Boxing</span>
                  <span data-lang-block="es" class="hidden-lang">Boxeo</span>
                </li>
              </ul>

              <a class="text-link" href="journeys.html#path2legend">
                <span data-lang-block="en">Explore Path2Legend</span>
                <span data-lang-block="es" class="hidden-lang">Explora Path2Legend</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </article>

          <article class="journey-card journey-card-gold journey-card-future">
            <div class="journey-card-media">
              <img
                src="assets/images/journeys/quest2mastery-home.png"
                alt="Quest2Mastery MMA journey artwork"
              />
            </div>

            <div class="journey-card-body">
              <p class="journey-age">
                <span data-lang-block="en">Ages 16+ · Coming Soon</span>
                <span data-lang-block="es" class="hidden-lang">Edades 16+ · Próximamente</span>
              </p>

              <h3>Quest2Mastery™</h3>

              <p data-lang-block="en">
                A future mixed martial arts journey for athletes pursuing complete
                combat development, advanced leadership, and mastery.
              </p>

              <p data-lang-block="es" class="hidden-lang">
                Un futuro camino de artes marciales mixtas para atletas que buscan
                desarrollo integral de combate, liderazgo avanzado y maestría.
              </p>

              <ul class="journey-list">
                <li>
                  <span data-lang-block="en">MMA</span>
                  <span data-lang-block="es" class="hidden-lang">MMA</span>
                </li>
                <li>
                  <span data-lang-block="en">Submission Grappling</span>
                  <span data-lang-block="es" class="hidden-lang">Grappling de Sumisión</span>
                </li>
              </ul>

              <a class="text-link" href="journeys.html#quest2mastery">
                <span data-lang-block="en">Preview Quest2Mastery</span>
                <span data-lang-block="es" class="hidden-lang">Conoce Quest2Mastery</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>
          </article>
        </div>

        <div class="fitness-strip">
          <div>
            <p class="eyebrow">
              <span data-lang-block="en">Everyday Fitness</span>
              <span data-lang-block="es" class="hidden-lang">Fitness Diario</span>
            </p>

            <h3>HIIT Fit™</h3>

            <p>
              <span data-lang-block="en">
                Non-contact fitness built around boxing, kickboxing, strength,
                and conditioning.
              </span>

              <span data-lang-block="es" class="hidden-lang">
                Fitness sin contacto basado en boxeo, kickboxing, fuerza y
                acondicionamiento.
              </span>
            </p>
          </div>

          <a class="button button-secondary" href="journeys.html#hiit-fit">
            <span data-lang-block="en">Explore HIIT Fit</span>
            <span data-lang-block="es" class="hidden-lang">Explora HIIT Fit</span>
          </a>
        </div>
      </div>
    </section>

    <section class="section system-preview">
      <div class="section-shell system-preview-grid">
        <div class="system-preview-media">
          <img
            src="assets/images/sections/home-system.png"
            alt="Sandman athlete development system"
          />
        </div>

        <div class="system-preview-copy">
          <p class="eyebrow">
            <span data-lang-block="en">The Sandman System</span>
            <span data-lang-block="es" class="hidden-lang">El Sistema Sandman</span>
          </p>

          <h2>
            <span data-lang-block="en">The Coach Teaches. The Athlete Earns. The System Remembers.</span>
            <span data-lang-block="es" class="hidden-lang">
              El Entrenador Enseña. El Atleta Se lo Gana. El Sistema lo Recuerda.
            </span>
          </h2>

          <div data-lang-block="en">
            <p class="lead">
              Progress is not based only on time served, attendance, or talent.
            </p>

            <p>
              Athletes advance through meaningful experiences, completed lessons,
              demonstrated skill, leadership, and consistency. The system preserves
              that journey so growth is visible, accountable, and earned.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              El progreso no se basa únicamente en tiempo, asistencia o talento.
            </p>

            <p>
              Los atletas avanzan mediante experiencias significativas, lecciones
              completadas, habilidad demostrada, liderazgo y constancia. El sistema
              conserva ese camino para que el crecimiento sea visible, responsable
              y ganado.
            </p>
          </div>

          <div class="pillar-grid">
            <article>
              <span class="pillar-icon">C</span>
              <h3>
                <span data-lang-block="en">Combat</span>
                <span data-lang-block="es" class="hidden-lang">Combate</span>
              </h3>
              <p>
                <span data-lang-block="en">Skill, timing, pressure, composure.</span>
                <span data-lang-block="es" class="hidden-lang">Habilidad, ritmo, presión y control.</span>
              </p>
            </article>

            <article>
              <span class="pillar-icon">S</span>
              <h3>
                <span data-lang-block="en">Strength</span>
                <span data-lang-block="es" class="hidden-lang">Fuerza</span>
              </h3>
              <p>
                <span data-lang-block="en">Capacity, resilience, physical confidence.</span>
                <span data-lang-block="es" class="hidden-lang">Capacidad, resiliencia y confianza física.</span>
              </p>
            </article>

            <article>
              <span class="pillar-icon">H</span>
              <h3>
                <span data-lang-block="en">Honor</span>
                <span data-lang-block="es" class="hidden-lang">Honor</span>
              </h3>
              <p>
                <span data-lang-block="en">Character, accountability, leadership.</span>
                <span data-lang-block="es" class="hidden-lang">Carácter, responsabilidad y liderazgo.</span>
              </p>
            </article>

            <article>
              <span class="pillar-icon">C</span>
              <h3>
                <span data-lang-block="en">Conditioning</span>
                <span data-lang-block="es" class="hidden-lang">Acondicionamiento</span>
              </h3>
              <p>
                <span data-lang-block="en">Readiness, work capacity, sustained effort.</span>
                <span data-lang-block="es" class="hidden-lang">Preparación, capacidad de trabajo y esfuerzo sostenido.</span>
              </p>
            </article>
          </div>

          <a class="button button-primary" href="system.html">
            <span data-lang-block="en">See How the System Works</span>
            <span data-lang-block="es" class="hidden-lang">Descubre Cómo Funciona el Sistema</span>
          </a>
        </div>
      </div>
    </section>

    <section class="section standards-banner">
      <div class="section-shell standards-banner-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">The Standard</span>
            <span data-lang-block="es" class="hidden-lang">El Estándar</span>
          </p>

          <h2>
            <span data-lang-block="en">
              Everyone Starts at Zero.<br />
              <strong>Every Step Is Earned.</strong>
            </span>

            <span data-lang-block="es" class="hidden-lang">
              Todos Comienzan en Cero.<br />
              <strong>Cada Paso Se Gana.</strong>
            </span>
          </h2>
        </div>

        <div class="standards-points">
          <article>
            <span>01</span>
            <div>
              <h3>
                <span data-lang-block="en">Coach-Led</span>
                <span data-lang-block="es" class="hidden-lang">Guiado por Entrenadores</span>
              </h3>
              <p>
                <span data-lang-block="en">Every athlete is known, guided, and developed.</span>
                <span data-lang-block="es" class="hidden-lang">Cada atleta es conocido, guiado y desarrollado.</span>
              </p>
            </div>
          </article>

          <article>
            <span>02</span>
            <div>
              <h3>
                <span data-lang-block="en">Earned Advancement</span>
                <span data-lang-block="es" class="hidden-lang">Avance Ganado</span>
              </h3>
              <p>
                <span data-lang-block="en">Hard work and consistency determine progress.</span>
                <span data-lang-block="es" class="hidden-lang">El trabajo duro y la constancia determinan el progreso.</span>
              </p>
            </div>
          </article>

          <article>
            <span>03</span>
            <div>
              <h3>
                <span data-lang-block="en">Character First</span>
                <span data-lang-block="es" class="hidden-lang">El Carácter Primero</span>
              </h3>
              <p>
                <span data-lang-block="en">Character is currency.</span>
                <span data-lang-block="es" class="hidden-lang">El carácter tiene valor.</span>
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="section family-start">
      <div class="section-shell">
        <div class="section-heading">
          <p class="eyebrow">
            <span data-lang-block="en">How Families Get Started</span>
            <span data-lang-block="es" class="hidden-lang">Cómo Comienzan las Familias</span>
          </p>

          <h2>
            <span data-lang-block="en">Clear Steps. Personal Guidance.</span>
            <span data-lang-block="es" class="hidden-lang">Pasos Claros. Guía Personal.</span>
          </h2>
        </div>

        <div class="start-grid">
          <article class="start-card">
            <span class="start-number">01</span>
            <h3>
              <span data-lang-block="en">Connect</span>
              <span data-lang-block="es" class="hidden-lang">Conéctate</span>
            </h3>
            <p>
              <span data-lang-block="en">
                Tell us who you are, who you are looking for, and what your goals are.
              </span>
              <span data-lang-block="es" class="hidden-lang">
                Cuéntanos quién eres, para quién buscas un programa y cuáles son tus metas.
              </span>
            </p>
          </article>

          <article class="start-card">
            <span class="start-number">02</span>
            <h3>
              <span data-lang-block="en">Meet</span>
              <span data-lang-block="es" class="hidden-lang">Reúnete</span>
            </h3>
            <p>
              <span data-lang-block="en">
                Meet with a coach to discuss readiness, program fit, and next steps.
              </span>
              <span data-lang-block="es" class="hidden-lang">
                Reúnete con un entrenador para hablar sobre preparación, el programa adecuado y los próximos pasos.
              </span>
            </p>
          </article>

          <article class="start-card">
            <span class="start-number">03</span>
            <h3>
              <span data-lang-block="en">Begin</span>
              <span data-lang-block="es" class="hidden-lang">Comienza</span>
            </h3>
            <p>
              <span data-lang-block="en">
                Enter the right journey with clear expectations and a coach-led path.
              </span>
              <span data-lang-block="es" class="hidden-lang">
                Entra al camino correcto con expectativas claras y una ruta guiada por un entrenador.
              </span>
            </p>
          </article>
        </div>

        <div class="start-action">
          <a class="button button-primary" href="connect.html">
            <span data-lang-block="en">Start the Conversation</span>
            <span data-lang-block="es" class="hidden-lang">Inicia la Conversación</span>
          </a>
        </div>
      </div>
    </section>

    <section class="section impact-preview">
      <div class="section-shell impact-preview-grid">
        <div class="impact-preview-copy">
          <p class="eyebrow">
            <span data-lang-block="en">Impact Beyond the Mat</span>
            <span data-lang-block="es" class="hidden-lang">Impacto Más Allá del Área de Entrenamiento</span>
          </p>

          <h2>
            <span data-lang-block="en">Stronger Athletes. Stronger Families. Stronger Communities.</span>
            <span data-lang-block="es" class="hidden-lang">
              Atletas Más Fuertes. Familias Más Fuertes. Comunidades Más Fuertes.
            </span>
          </h2>

          <p class="lead">
            <span data-lang-block="en">
              The value of training should show up everywhere an athlete goes.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El valor del entrenamiento debe reflejarse en cada lugar al que vaya el atleta.
            </span>
          </p>

          <p>
            <span data-lang-block="en">
              Sandman is built to help athletes become more disciplined in school,
              more reliable at home, more composed under pressure, and more prepared
              to lead.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Sandman está diseñado para ayudar a los atletas a ser más disciplinados
              en la escuela, más responsables en casa, más serenos bajo presión y más
              preparados para liderar.
            </span>
          </p>

          <a class="button button-secondary" href="impact.html">
            <span data-lang-block="en">Explore the Impact</span>
            <span data-lang-block="es" class="hidden-lang">Explora el Impacto</span>
          </a>
        </div>

        <div class="impact-preview-media">
          <img
            src="assets/images/sections/home-impact.png"
            alt="Sandman athletes and families in the community"
          />
        </div>
      </div>
    </section>

    <section class="section final-cta">
      <div class="section-shell final-cta-panel">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">Your Journey Starts Here</span>
            <span data-lang-block="es" class="hidden-lang">Tu Camino Comienza Aquí</span>
          </p>

          <h2>
            <span data-lang-block="en">Ready to Take the First Step?</span>
            <span data-lang-block="es" class="hidden-lang">¿Listo Para Dar el Primer Paso?</span>
          </h2>

          <p>
            <span data-lang-block="en">
              Connect with Sandman Combat and discover the right path for your athlete or family.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Conéctate con Sandman Combat y descubre el camino adecuado para tu atleta o familia.
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

HOME_CSS = r"""/* =========================================================
   Sandman Combat — Public Next Home
   File: public-next/assets/css/home.css
========================================================= */

.home-hero {
  position: relative;
  display: grid;
  min-height: min(920px, 100svh);
  align-items: end;
  overflow: hidden;
  background: #050505;
}

.home-hero-media,
.home-hero-overlay {
  position: absolute;
  inset: 0;
}

.home-hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
}

.home-hero-overlay {
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.92) 0%, rgba(0, 0, 0, 0.68) 42%, rgba(0, 0, 0, 0.18) 75%),
    linear-gradient(0deg, rgba(0, 0, 0, 0.96) 0%, transparent 48%);
}

.home-hero-content {
  position: relative;
  z-index: 2;
  width: 100%;
  padding-top: clamp(8rem, 16vw, 14rem);
  padding-bottom: clamp(5rem, 11vw, 8rem);
}

.hero-kicker {
  margin: 0 0 1rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.24em;
  text-transform: uppercase;
}

.home-hero h1 {
  max-width: 980px;
  margin: 0;
  color: #f7f7f7;
  font-size: clamp(3.1rem, 8vw, 7.8rem);
  line-height: 0.91;
  letter-spacing: -0.055em;
}

.home-hero h1 strong {
  color: var(--brand-red-bright, #d11f27);
}

.hero-lead {
  max-width: 760px;
  margin: 1.8rem 0 0;
  color: rgba(255, 255, 255, 0.84);
  font-size: clamp(1.08rem, 2.1vw, 1.42rem);
  line-height: 1.65;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 2rem;
}

.hero-scroll-cue {
  position: absolute;
  right: clamp(1.25rem, 4vw, 4rem);
  bottom: 2rem;
  z-index: 2;
  display: grid;
  width: 34px;
  height: 52px;
  place-items: start center;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 999px;
}

.hero-scroll-cue span {
  width: 4px;
  height: 10px;
  margin-top: 10px;
  border-radius: 999px;
  background: #fff;
  animation: hero-scroll 1.8s infinite;
}

@keyframes hero-scroll {
  0% {
    opacity: 0;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateY(20px);
  }
}

.home-intro {
  position: relative;
  overflow: hidden;
}

.home-intro::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  background: var(--brand-red, #b51219);
}

.intro-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: start;
}

.intro-grid h2 {
  max-width: 12ch;
}

.intro-grid h2 strong {
  color: var(--brand-red-bright, #d11f27);
}

.intro-copy {
  max-width: 780px;
}

.journeys-preview {
  background:
    radial-gradient(circle at 50% 10%, rgba(181, 18, 25, 0.11), transparent 30%),
    var(--surface-deep, #0b0b0c);
}

.journey-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.25rem;
  margin-top: 2.75rem;
}

.journey-card {
  overflow: hidden;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 22px;
  background: var(--surface, #111113);
}

.journey-card-silver {
  box-shadow: inset 0 3px 0 rgba(219, 223, 228, 0.8);
}

.journey-card-gold {
  box-shadow: inset 0 3px 0 rgba(212, 177, 71, 0.9);
}

.journey-card-future {
  opacity: 0.94;
}

.journey-card-media {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: #080808;
}

.journey-card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.journey-card-body {
  padding: clamp(1.35rem, 3vw, 2rem);
}

.journey-age {
  margin: 0 0 0.6rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: 0.73rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.journey-card h3 {
  margin: 0 0 1rem;
  font-size: clamp(1.8rem, 3vw, 2.5rem);
}

.journey-card p {
  color: var(--text-soft, #d6d6d8);
}

.journey-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin: 1.25rem 0;
  padding: 0;
  list-style: none;
}

.journey-list li {
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 999px;
  color: var(--text-soft, #d6d6d8);
  font-size: 0.82rem;
}

.fitness-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: center;
  margin-top: 1.5rem;
  padding: clamp(1.5rem, 4vw, 2.5rem);
  border: 1px solid rgba(181, 18, 25, 0.42);
  border-radius: 20px;
  background:
    linear-gradient(110deg, rgba(181, 18, 25, 0.12), transparent),
    var(--surface, #111113);
}

.fitness-strip h3 {
  margin: 0 0 0.4rem;
  font-size: clamp(1.8rem, 4vw, 3rem);
}

.fitness-strip p:last-child {
  margin-bottom: 0;
}

.system-preview-grid,
.impact-preview-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: center;
}

.system-preview-media,
.impact-preview-media {
  overflow: hidden;
  min-height: 570px;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 40%, rgba(181, 18, 25, 0.18), transparent 38%),
    #090909;
}

.system-preview-media img,
.impact-preview-media img {
  width: 100%;
  height: 100%;
  min-height: inherit;
  object-fit: cover;
}

.system-preview-copy h2,
.impact-preview-copy h2 {
  margin-bottom: 1.4rem;
}

.pillar-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  margin: 1.75rem 0 2rem;
}

.pillar-grid article {
  padding: 1rem;
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.018);
}

.pillar-icon {
  display: grid;
  width: 36px;
  aspect-ratio: 1;
  place-items: center;
  margin-bottom: 0.8rem;
  border: 1px solid rgba(205, 31, 39, 0.52);
  border-radius: 50%;
  color: var(--brand-red-bright, #d11f27);
  font-size: 0.78rem;
  font-weight: 900;
}

.pillar-grid h3 {
  margin: 0 0 0.3rem;
  font-size: 1rem;
}

.pillar-grid p {
  margin: 0;
  color: var(--text-soft, #d6d6d8);
  font-size: 0.88rem;
}

.standards-banner {
  background:
    linear-gradient(100deg, rgba(255, 255, 255, 0.97), rgba(226, 226, 226, 0.96));
  color: #111;
}

.standards-banner .eyebrow {
  color: #b51219;
}

.standards-banner h2 {
  color: #111;
}

.standards-banner h2 strong {
  color: #b51219;
}

.standards-banner-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: start;
}

.standards-points {
  border-top: 1px solid rgba(0, 0, 0, 0.16);
}

.standards-points article {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  padding: 1.35rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.16);
}

.standards-points article > span {
  color: #b51219;
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.standards-points h3 {
  margin: 0 0 0.25rem;
  color: #111;
}

.standards-points p {
  margin: 0;
  color: #2e2e2e;
}

.family-start {
  background: var(--surface-deep, #0b0b0c);
}

.start-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 2.5rem;
}

.start-card {
  position: relative;
  min-height: 280px;
  padding: clamp(1.35rem, 3vw, 2.25rem);
  border: 1px solid var(--line, rgba(255, 255, 255, 0.12));
  border-radius: 20px;
  background: var(--surface, #111113);
}

.start-number {
  display: block;
  margin-bottom: 3rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.start-card h3 {
  margin: 0 0 0.85rem;
  font-size: clamp(1.55rem, 3vw, 2rem);
}

.start-card p {
  margin: 0;
  color: var(--text-soft, #d6d6d8);
}

.start-action {
  display: flex;
  justify-content: center;
  margin-top: 2rem;
}

.impact-preview {
  overflow: hidden;
}

.impact-preview-copy {
  max-width: 760px;
}

.impact-preview-copy .button {
  margin-top: 0.7rem;
}

.final-cta {
  padding-top: clamp(2rem, 6vw, 5rem);
}

.final-cta-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2rem;
  align-items: center;
  padding: clamp(1.75rem, 5vw, 3.75rem);
  border: 1px solid rgba(205, 31, 39, 0.55);
  border-radius: 24px;
  background:
    linear-gradient(110deg, rgba(181, 18, 25, 0.16), rgba(255, 255, 255, 0.018)),
    var(--surface, #101012);
}

.final-cta-panel h2 {
  margin-bottom: 0.7rem;
}

.final-cta-panel p {
  max-width: 760px;
  margin: 0;
  color: var(--text-soft, #d6d6d8);
}

@media (max-width: 1100px) {
  .journey-grid {
    grid-template-columns: 1fr;
  }

  .journey-card {
    display: grid;
    grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.28fr);
  }

  .journey-card-media {
    aspect-ratio: auto;
    min-height: 100%;
  }
}

@media (max-width: 900px) {
  .home-hero {
    min-height: 860px;
  }

  .home-hero-overlay {
    background:
      linear-gradient(0deg, rgba(0, 0, 0, 0.96) 0%, rgba(0, 0, 0, 0.58) 65%, rgba(0, 0, 0, 0.25) 100%);
  }

  .intro-grid,
  .system-preview-grid,
  .impact-preview-grid,
  .standards-banner-grid {
    grid-template-columns: 1fr;
  }

  .intro-grid h2 {
    max-width: none;
  }

  .system-preview-media,
  .impact-preview-media {
    min-height: 430px;
  }

  .fitness-strip,
  .final-cta-panel {
    grid-template-columns: 1fr;
  }

  .start-grid {
    grid-template-columns: 1fr;
  }

  .start-card {
    min-height: auto;
  }
}

@media (max-width: 700px) {
  .home-hero {
    min-height: 780px;
  }

  .home-hero-media img {
    object-position: 62% center;
  }

  .home-hero h1 {
    font-size: clamp(3rem, 15vw, 5.2rem);
  }

  .hero-actions {
    display: grid;
  }

  .hero-actions .button {
    width: 100%;
  }

  .journey-card {
    display: block;
  }

  .journey-card-media {
    min-height: 0;
    aspect-ratio: 16 / 10;
  }

  .pillar-grid {
    grid-template-columns: 1fr;
  }

  .fitness-strip .button,
  .final-cta-panel .button {
    width: 100%;
  }

  .hero-scroll-cue {
    display: none;
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

    write_file(HOME_FILE, HOME_HTML)
    write_file(HOME_CSS_FILE, HOME_CSS)

    print()
    print("Home page build complete.")
    print()
    print("Image paths already wired:")
    print("  assets/images/hero/hero-home-en.png")
    print("  assets/images/hero/hero-home-es.png")
    print("  assets/images/journeys/zero2hero-home.png")
    print("  assets/images/journeys/path2legend-home.png")
    print("  assets/images/journeys/quest2mastery-home.png")
    print("  assets/images/sections/home-system.png")
    print("  assets/images/sections/home-impact.png")


if __name__ == "__main__":
    main()
