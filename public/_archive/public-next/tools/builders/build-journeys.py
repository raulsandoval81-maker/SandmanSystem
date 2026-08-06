#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Journeys page.

Run from the SandmanSystem project root:

    python3 public-next/tools/builders/build-journeys.py

Creates or replaces:

    public-next/journeys.html
    public-next/assets/css/journeys.css

Expected image files:

    public-next/assets/images/hero/hero-journeys-en.png
    public-next/assets/images/hero/hero-journeys-es.png

    public-next/assets/images/journeys/zero2hero-journey.png
    public-next/assets/images/journeys/path2legend-journey.png
    public-next/assets/images/journeys/quest2mastery-journey.png
    public-next/assets/images/journeys/hiit-fit-journey.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC_NEXT = ROOT / "public-next"
HTML_FILE = PUBLIC_NEXT / "journeys.html"
CSS_FILE = PUBLIC_NEXT / "assets" / "css" / "journeys.css"

HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>Journeys | Sandman Combat™</title>

  <meta
    name="description"
    content="Explore Sandman Combat journeys for youth, teen, adult, MMA, and everyday fitness athletes."
  />

  <link rel="stylesheet" href="assets/css/site.css" />
  <link rel="stylesheet" href="assets/css/journeys.css" />

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

        <a href="journeys.html" aria-current="page">
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
    <section class="journeys-hero">
      <div class="journeys-hero-media" aria-hidden="true">
        <img
          src="assets/images/hero/hero-journeys-en.png"
          alt=""
          data-lang-block="en"
        />
        <img
          src="assets/images/hero/hero-journeys-es.png"
          alt=""
          data-lang-block="es"
          class="hidden-lang"
        />
      </div>

      <div class="journeys-hero-overlay"></div>

      <div class="section-shell journeys-hero-content">
        <p class="eyebrow">
          <span data-lang-block="en">Choose Your Journey</span>
          <span data-lang-block="es" class="hidden-lang">Elige Tu Camino</span>
        </p>

        <h1>
          <span data-lang-block="en">
            Different Starting Points.<br />
            <strong>One Standard.</strong>
          </span>

          <span data-lang-block="es" class="hidden-lang">
            Diferentes Puntos de Partida.<br />
            <strong>Un Solo Estándar.</strong>
          </span>
        </h1>

        <p class="hero-lead">
          <span data-lang-block="en">
            Every Sandman journey is built around earned progress, clear expectations,
            coach-led development, and long-term growth.
          </span>

          <span data-lang-block="es" class="hidden-lang">
            Cada camino Sandman se construye sobre progreso ganado, expectativas claras,
            desarrollo guiado por entrenadores y crecimiento a largo plazo.
          </span>
        </p>
      </div>
    </section>

    <section class="section journey-index">
      <div class="section-shell">
        <div class="journey-index-grid">
          <a href="#zero2hero" class="journey-index-card silver">
            <span class="journey-index-age">
              <span data-lang-block="en">Ages 6–13</span>
              <span data-lang-block="es" class="hidden-lang">Edades 6–13</span>
            </span>
            <strong>Zero2Hero™</strong>
            <small>
              <span data-lang-block="en">Youth Development</span>
              <span data-lang-block="es" class="hidden-lang">Desarrollo Juvenil</span>
            </small>
          </a>

          <a href="#path2legend" class="journey-index-card gold">
            <span class="journey-index-age">
              <span data-lang-block="en">Ages 14+</span>
              <span data-lang-block="es" class="hidden-lang">Edades 14+</span>
            </span>
            <strong>Path2Legend™</strong>
            <small>
              <span data-lang-block="en">Teen & Adult Development</span>
              <span data-lang-block="es" class="hidden-lang">Desarrollo Adolescente y Adulto</span>
            </small>
          </a>

          <a href="#quest2mastery" class="journey-index-card gold">
            <span class="journey-index-age">
              <span data-lang-block="en">Ages 16+ · Coming Soon</span>
              <span data-lang-block="es" class="hidden-lang">Edades 16+ · Próximamente</span>
            </span>
            <strong>Quest2Mastery™</strong>
            <small>
              <span data-lang-block="en">MMA Development</span>
              <span data-lang-block="es" class="hidden-lang">Desarrollo de MMA</span>
            </small>
          </a>

          <a href="#hiit-fit" class="journey-index-card fitness">
            <span class="journey-index-age">
              <span data-lang-block="en">Ages 12+</span>
              <span data-lang-block="es" class="hidden-lang">Edades 12+</span>
            </span>
            <strong>HIIT Fit™</strong>
            <small>
              <span data-lang-block="en">Everyday Fitness</span>
              <span data-lang-block="es" class="hidden-lang">Fitness Diario</span>
            </small>
          </a>
        </div>
      </div>
    </section>

    <section id="zero2hero" class="section journey-section journey-silver">
      <div class="section-shell journey-layout">
        <div class="journey-media">
          <img
            src="assets/images/journeys/zero2hero-journey.png"
            alt="Zero2Hero youth journey"
          />
        </div>

        <div class="journey-content">
          <div class="journey-heading">
            <p class="journey-label">
              <span data-lang-block="en">Youth Journey · Ages 6–13</span>
              <span data-lang-block="es" class="hidden-lang">Camino Juvenil · Edades 6–13</span>
            </p>

            <h2>Zero2Hero™</h2>

            <p class="journey-tagline">
              <span data-lang-block="en">Confidence begins with competence.</span>
              <span data-lang-block="es" class="hidden-lang">La confianza comienza con la competencia.</span>
            </p>
          </div>

          <div data-lang-block="en">
            <p class="lead">
              Zero2Hero introduces young athletes to the discipline, structure,
              challenge, and belonging of combat sports.
            </p>

            <p>
              Athletes learn how to listen, move, practice, compete, recover from
              mistakes, and keep going. The journey is demanding, age-appropriate,
              and built around visible growth.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Zero2Hero presenta a los atletas jóvenes la disciplina, estructura,
              desafío y sentido de pertenencia de los deportes de combate.
            </p>

            <p>
              Los atletas aprenden a escuchar, moverse, practicar, competir,
              recuperarse de los errores y seguir adelante. El camino es exigente,
              apropiado para la edad y enfocado en crecimiento visible.
            </p>
          </div>

          <div class="journey-details-grid">
            <article>
              <h3>
                <span data-lang-block="en">Programs</span>
                <span data-lang-block="es" class="hidden-lang">Programas</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Wrestling</span>
                  <span data-lang-block="es" class="hidden-lang">Lucha</span>
                </li>
                <li>Kickboxing</li>
              </ul>
            </article>

            <article>
              <h3>
                <span data-lang-block="en">Built For</span>
                <span data-lang-block="es" class="hidden-lang">Diseñado Para</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Confidence</span>
                  <span data-lang-block="es" class="hidden-lang">Confianza</span>
                </li>
                <li>
                  <span data-lang-block="en">Coordination</span>
                  <span data-lang-block="es" class="hidden-lang">Coordinación</span>
                </li>
                <li>
                  <span data-lang-block="en">Courage</span>
                  <span data-lang-block="es" class="hidden-lang">Valor</span>
                </li>
              </ul>
            </article>
          </div>

          <div class="rank-panel">
            <p class="rank-panel-title">
              <span data-lang-block="en">The Journey</span>
              <span data-lang-block="es" class="hidden-lang">El Camino</span>
            </p>

            <div class="rank-flow">
              <span>Shadow</span>
              <span>Recruit</span>
              <span>Contender</span>
              <span>Competitor</span>
              <span>Warrior</span>
              <span>Champion</span>
              <span>Commander</span>
              <span>Hero</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="path2legend" class="section journey-section journey-gold">
      <div class="section-shell journey-layout journey-layout-reverse">
        <div class="journey-media">
          <img
            src="assets/images/journeys/path2legend-journey.png"
            alt="Path2Legend teen and adult journey"
          />
        </div>

        <div class="journey-content">
          <div class="journey-heading">
            <p class="journey-label">
              <span data-lang-block="en">Teen & Adult Journey · Ages 14+</span>
              <span data-lang-block="es" class="hidden-lang">Camino Adolescente y Adulto · Edades 14+</span>
            </p>

            <h2>Path2Legend™</h2>

            <p class="journey-tagline">
              <span data-lang-block="en">Train with purpose. Lead by example.</span>
              <span data-lang-block="es" class="hidden-lang">Entrena con propósito. Lidera con el ejemplo.</span>
            </p>
          </div>

          <div data-lang-block="en">
            <p class="lead">
              Path2Legend is built for athletes ready to accept greater standards,
              deeper accountability, and long-term commitment.
            </p>

            <p>
              The journey develops advanced skill, composure, work capacity,
              leadership, and the ability to serve others through example.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Path2Legend está diseñado para atletas preparados para aceptar
              estándares más altos, mayor responsabilidad y compromiso a largo plazo.
            </p>

            <p>
              El camino desarrolla habilidad avanzada, serenidad, capacidad de trabajo,
              liderazgo y la capacidad de servir a otros con el ejemplo.
            </p>
          </div>

          <div class="journey-details-grid">
            <article>
              <h3>
                <span data-lang-block="en">Programs</span>
                <span data-lang-block="es" class="hidden-lang">Programas</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Wrestling</span>
                  <span data-lang-block="es" class="hidden-lang">Lucha</span>
                </li>
                <li>
                  <span data-lang-block="en">Boxing</span>
                  <span data-lang-block="es" class="hidden-lang">Boxeo</span>
                </li>
              </ul>
            </article>

            <article>
              <h3>
                <span data-lang-block="en">Built For</span>
                <span data-lang-block="es" class="hidden-lang">Diseñado Para</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Pressure</span>
                  <span data-lang-block="es" class="hidden-lang">Presión</span>
                </li>
                <li>
                  <span data-lang-block="en">Leadership</span>
                  <span data-lang-block="es" class="hidden-lang">Liderazgo</span>
                </li>
                <li>
                  <span data-lang-block="en">Competition readiness</span>
                  <span data-lang-block="es" class="hidden-lang">Preparación competitiva</span>
                </li>
              </ul>
            </article>
          </div>

          <div class="rank-panel">
            <p class="rank-panel-title">
              <span data-lang-block="en">The Journey</span>
              <span data-lang-block="es" class="hidden-lang">El Camino</span>
            </p>

            <div class="rank-flow">
              <span>Apprentice</span>
              <span>Warrior</span>
              <span>Champion</span>
              <span>Veteran</span>
              <span>Legend</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="quest2mastery" class="section journey-section journey-gold journey-coming-soon">
      <div class="section-shell journey-layout">
        <div class="journey-media">
          <img
            src="assets/images/journeys/quest2mastery-journey.png"
            alt="Quest2Mastery MMA journey"
          />
          <span class="coming-soon-badge">
            <span data-lang-block="en">Coming Soon</span>
            <span data-lang-block="es" class="hidden-lang">Próximamente</span>
          </span>
        </div>

        <div class="journey-content">
          <div class="journey-heading">
            <p class="journey-label">
              <span data-lang-block="en">MMA Journey · Ages 16+</span>
              <span data-lang-block="es" class="hidden-lang">Camino de MMA · Edades 16+</span>
            </p>

            <h2>Quest2Mastery™</h2>

            <p class="journey-tagline">
              <span data-lang-block="en">The pursuit of complete combat development.</span>
              <span data-lang-block="es" class="hidden-lang">La búsqueda del desarrollo integral de combate.</span>
            </p>
          </div>

          <div data-lang-block="en">
            <p class="lead">
              Quest2Mastery is the future advanced journey for athletes pursuing
              complete mixed martial arts development.
            </p>

            <p>
              It will unite striking, grappling, conditioning, competition,
              leadership, and long-term mastery under one earned progression system.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              Quest2Mastery será el camino avanzado para atletas que buscan un
              desarrollo completo en artes marciales mixtas.
            </p>

            <p>
              Unirá golpeo, grappling, acondicionamiento, competencia, liderazgo
              y dominio a largo plazo bajo un solo sistema de progreso ganado.
            </p>
          </div>

          <div class="journey-details-grid">
            <article>
              <h3>
                <span data-lang-block="en">Programs</span>
                <span data-lang-block="es" class="hidden-lang">Programas</span>
              </h3>
              <ul>
                <li>MMA</li>
                <li>
                  <span data-lang-block="en">Submission Grappling</span>
                  <span data-lang-block="es" class="hidden-lang">Grappling de Sumisión</span>
                </li>
              </ul>
            </article>

            <article>
              <h3>
                <span data-lang-block="en">Built For</span>
                <span data-lang-block="es" class="hidden-lang">Diseñado Para</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Complete development</span>
                  <span data-lang-block="es" class="hidden-lang">Desarrollo completo</span>
                </li>
                <li>
                  <span data-lang-block="en">Advanced competition</span>
                  <span data-lang-block="es" class="hidden-lang">Competencia avanzada</span>
                </li>
                <li>
                  <span data-lang-block="en">Mastery</span>
                  <span data-lang-block="es" class="hidden-lang">Maestría</span>
                </li>
              </ul>
            </article>
          </div>

          <div class="rank-panel">
            <p class="rank-panel-title">
              <span data-lang-block="en">The Journey</span>
              <span data-lang-block="es" class="hidden-lang">El Camino</span>
            </p>

            <div class="rank-flow">
              <span>Apprentice</span>
              <span>Champion</span>
              <span>Veteran</span>
              <span>Master</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="hiit-fit" class="section journey-section journey-fitness">
      <div class="section-shell journey-layout journey-layout-reverse">
        <div class="journey-media">
          <img
            src="assets/images/journeys/hiit-fit-journey.png"
            alt="HIIT Fit everyday fitness journey"
          />
        </div>

        <div class="journey-content">
          <div class="journey-heading">
            <p class="journey-label">
              <span data-lang-block="en">Everyday Fitness · Ages 12+</span>
              <span data-lang-block="es" class="hidden-lang">Fitness Diario · Edades 12+</span>
            </p>

            <h2>HIIT Fit™</h2>

            <p class="journey-tagline">
              <span data-lang-block="en">Train hard without entering combat.</span>
              <span data-lang-block="es" class="hidden-lang">Entrena fuerte sin entrar al combate.</span>
            </p>
          </div>

          <div data-lang-block="en">
            <p class="lead">
              HIIT Fit is a non-contact fitness journey built around combat-inspired
              movement, strength, intervals, and conditioning.
            </p>

            <p>
              It gives teens and adults a challenging, supportive path toward better
              health, confidence, energy, and physical readiness.
            </p>
          </div>

          <div data-lang-block="es" class="hidden-lang">
            <p class="lead">
              HIIT Fit es un camino de fitness sin contacto basado en movimientos
              inspirados en combate, fuerza, intervalos y acondicionamiento.
            </p>

            <p>
              Ofrece a adolescentes y adultos un camino desafiante y de apoyo hacia
              mejor salud, confianza, energía y preparación física.
            </p>
          </div>

          <div class="journey-details-grid">
            <article>
              <h3>
                <span data-lang-block="en">Formats</span>
                <span data-lang-block="es" class="hidden-lang">Formatos</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Boxing Fitness</span>
                  <span data-lang-block="es" class="hidden-lang">Fitness de Boxeo</span>
                </li>
                <li>
                  <span data-lang-block="en">Kickboxing Fitness</span>
                  <span data-lang-block="es" class="hidden-lang">Fitness de Kickboxing</span>
                </li>
                <li>
                  <span data-lang-block="en">Strength</span>
                  <span data-lang-block="es" class="hidden-lang">Fuerza</span>
                </li>
              </ul>
            </article>

            <article>
              <h3>
                <span data-lang-block="en">Built For</span>
                <span data-lang-block="es" class="hidden-lang">Diseñado Para</span>
              </h3>
              <ul>
                <li>
                  <span data-lang-block="en">Conditioning</span>
                  <span data-lang-block="es" class="hidden-lang">Acondicionamiento</span>
                </li>
                <li>
                  <span data-lang-block="en">Energy</span>
                  <span data-lang-block="es" class="hidden-lang">Energía</span>
                </li>
                <li>
                  <span data-lang-block="en">Healthy routines</span>
                  <span data-lang-block="es" class="hidden-lang">Rutinas saludables</span>
                </li>
              </ul>
            </article>
          </div>

          <div class="fitness-note">
            <strong>
              <span data-lang-block="en">Non-contact by design.</span>
              <span data-lang-block="es" class="hidden-lang">Sin contacto por diseño.</span>
            </strong>
            <p>
              <span data-lang-block="en">
                HIIT Fit develops fitness through bags, mitts, movement, strength,
                and conditioning—not live combat.
              </span>
              <span data-lang-block="es" class="hidden-lang">
                HIIT Fit desarrolla condición física mediante sacos, manoplas,
                movimiento, fuerza y acondicionamiento, no combate en vivo.
              </span>
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="section earned-standard">
      <div class="section-shell earned-standard-grid">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">The Shared Standard</span>
            <span data-lang-block="es" class="hidden-lang">El Estándar Compartido</span>
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

        <div>
          <p class="lead">
            <span data-lang-block="en">
              Sandman journeys are not shortcuts, automatic promotions, or participation rewards.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Los caminos Sandman no son atajos, ascensos automáticos ni premios por participar.
            </span>
          </p>

          <p>
            <span data-lang-block="en">
              Character is currency. Hard work and consistency determine progress.
              The coach teaches, the athlete earns, and the system remembers.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              El carácter tiene valor. El trabajo duro y la constancia determinan
              el progreso. El entrenador enseña, el atleta se lo gana y el sistema lo recuerda.
            </span>
          </p>
        </div>
      </div>
    </section>

    <section class="section availability-section">
      <div class="section-shell availability-panel">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">Program Availability</span>
            <span data-lang-block="es" class="hidden-lang">Disponibilidad de Programas</span>
          </p>

          <h2>
            <span data-lang-block="en">Not Every Program Is Offered at Every Academy.</span>
            <span data-lang-block="es" class="hidden-lang">No Todos los Programas Se Ofrecen en Cada Academia.</span>
          </h2>
        </div>

        <div>
          <p>
            <span data-lang-block="en">
              Wrestling, boxing, kickboxing, submission grappling, MMA, and fitness
              offerings may vary by location, season, coach availability, and athlete readiness.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              La lucha, el boxeo, el kickboxing, el grappling de sumisión, MMA y los
              programas de fitness pueden variar según la ubicación, temporada,
              disponibilidad del entrenador y preparación del atleta.
            </span>
          </p>

          <a class="button button-primary" href="connect.html">
            <span data-lang-block="en">Ask About Your Location</span>
            <span data-lang-block="es" class="hidden-lang">Pregunta por Tu Ubicación</span>
          </a>
        </div>
      </div>
    </section>

    <section class="section final-cta">
      <div class="section-shell final-cta-panel">
        <div>
          <p class="eyebrow">
            <span data-lang-block="en">Find the Right Fit</span>
            <span data-lang-block="es" class="hidden-lang">Encuentra el Camino Adecuado</span>
          </p>

          <h2>
            <span data-lang-block="en">Not Sure Which Journey Fits?</span>
            <span data-lang-block="es" class="hidden-lang">¿No Sabes Qué Camino Es el Adecuado?</span>
          </h2>

          <p>
            <span data-lang-block="en">
              Connect with a coach and we will help determine the right starting point.
            </span>
            <span data-lang-block="es" class="hidden-lang">
              Conéctate con un entrenador y te ayudaremos a determinar el punto de inicio correcto.
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
   Sandman Combat — Public Next Journeys
========================================================= */

.journeys-hero {
  position: relative;
  display: grid;
  min-height: 760px;
  align-items: end;
  overflow: hidden;
  background: #050505;
}

.journeys-hero-media,
.journeys-hero-overlay {
  position: absolute;
  inset: 0;
}

.journeys-hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.journeys-hero-overlay {
  background:
    linear-gradient(90deg, rgba(0,0,0,.92), rgba(0,0,0,.58) 55%, rgba(0,0,0,.18)),
    linear-gradient(0deg, rgba(0,0,0,.94), transparent 58%);
}

.journeys-hero-content {
  position: relative;
  z-index: 2;
  padding-top: 10rem;
  padding-bottom: 6rem;
}

.journeys-hero h1 {
  max-width: 980px;
  margin: 0;
  color: #fff;
  font-size: clamp(3.4rem, 8vw, 7.4rem);
  line-height: .92;
  letter-spacing: -.055em;
}

.journeys-hero h1 strong {
  color: var(--brand-red-bright, #d11f27);
}

.hero-lead {
  max-width: 760px;
  margin-top: 1.5rem;
  color: rgba(255,255,255,.84);
  font-size: clamp(1.08rem, 2vw, 1.4rem);
  line-height: 1.65;
}

.journey-index {
  padding-top: 1.5rem;
  padding-bottom: 1.5rem;
  background: var(--surface-deep, #0b0b0c);
}

.journey-index-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0,1fr));
  gap: .8rem;
}

.journey-index-card {
  display: grid;
  gap: .35rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 16px;
  background: var(--surface, #111113);
  text-decoration: none;
  transition: transform .2s ease, border-color .2s ease;
}

.journey-index-card:hover {
  transform: translateY(-2px);
}

.journey-index-card.silver {
  box-shadow: inset 0 3px 0 #c9ced4;
}

.journey-index-card.gold {
  box-shadow: inset 0 3px 0 #d4b147;
}

.journey-index-card.fitness {
  box-shadow: inset 0 3px 0 var(--brand-red-bright, #d11f27);
}

.journey-index-card strong {
  color: var(--text, #fff);
  font-size: 1.1rem;
}

.journey-index-card small,
.journey-index-age {
  color: var(--text-soft, #cfcfd2);
}

.journey-index-age {
  font-size: .69rem;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.journey-section {
  position: relative;
  overflow: hidden;
}

.journey-section::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .22;
}

.journey-silver::before {
  background: radial-gradient(circle at 18% 35%, rgba(213,219,225,.28), transparent 28%);
}

.journey-gold::before {
  background: radial-gradient(circle at 82% 35%, rgba(212,177,71,.22), transparent 30%);
}

.journey-fitness::before {
  background: radial-gradient(circle at 18% 35%, rgba(181,18,25,.2), transparent 30%);
}

.journey-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0,.88fr) minmax(0,1.12fr);
  gap: clamp(2rem, 7vw, 7rem);
  align-items: center;
}

.journey-layout-reverse .journey-media {
  order: 2;
}

.journey-media {
  position: relative;
  overflow: hidden;
  min-height: 620px;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 26px;
  background: #080808;
}

.journey-media img {
  width: 100%;
  height: 100%;
  min-height: inherit;
  object-fit: cover;
}

.coming-soon-badge {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  padding: .55rem .85rem;
  border: 1px solid rgba(212,177,71,.7);
  border-radius: 999px;
  background: rgba(0,0,0,.76);
  color: #e2c568;
  font-size: .72rem;
  font-weight: 900;
  letter-spacing: .12em;
  text-transform: uppercase;
}

.journey-label {
  margin: 0 0 .65rem;
  color: var(--brand-red-bright, #d11f27);
  font-size: .74rem;
  font-weight: 900;
  letter-spacing: .15em;
  text-transform: uppercase;
}

.journey-content h2 {
  margin: 0;
  font-size: clamp(2.7rem, 6vw, 5.7rem);
  line-height: .95;
  letter-spacing: -.045em;
}

.journey-tagline {
  margin: .8rem 0 1.7rem;
  color: var(--text-soft, #d4d4d7);
  font-size: clamp(1.05rem, 2vw, 1.3rem);
}

.journey-details-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: .8rem;
  margin: 1.7rem 0;
}

.journey-details-grid article {
  padding: 1.15rem;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 16px;
  background: rgba(255,255,255,.018);
}

.journey-details-grid h3 {
  margin: 0 0 .75rem;
  font-size: 1rem;
}

.journey-details-grid ul {
  margin: 0;
  padding-left: 1.15rem;
  color: var(--text-soft, #d4d4d7);
}

.journey-details-grid li + li {
  margin-top: .35rem;
}

.rank-panel,
.fitness-note {
  padding: 1.15rem;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 16px;
  background: var(--surface, #111113);
}

.rank-panel-title {
  margin: 0 0 .8rem;
  color: var(--text-soft, #d4d4d7);
  font-size: .72rem;
  font-weight: 900;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.rank-flow {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
}

.rank-flow span {
  padding: .45rem .65rem;
  border: 1px solid var(--line, rgba(255,255,255,.12));
  border-radius: 999px;
  font-size: .79rem;
}

.journey-silver .rank-flow span {
  border-color: rgba(204,210,216,.48);
}

.journey-gold .rank-flow span {
  border-color: rgba(212,177,71,.48);
}

.fitness-note strong {
  color: var(--brand-red-bright, #d11f27);
}

.fitness-note p {
  margin-bottom: 0;
}

.earned-standard {
  background: linear-gradient(100deg, #f2f2f2, #dcdcdc);
  color: #111;
}

.earned-standard .eyebrow {
  color: #b51219;
}

.earned-standard h2 {
  color: #111;
}

.earned-standard h2 strong {
  color: #b51219;
}

.earned-standard-grid {
  display: grid;
  grid-template-columns: minmax(0,.95fr) minmax(0,1.05fr);
  gap: clamp(2rem, 7vw, 7rem);
}

.earned-standard p {
  color: #2e2e2e;
}

.availability-panel,
.final-cta-panel {
  display: grid;
  grid-template-columns: minmax(0,1fr) minmax(0,1fr);
  gap: clamp(2rem, 6vw, 5rem);
  align-items: center;
  padding: clamp(1.6rem, 4vw, 3rem);
  border: 1px solid rgba(181,18,25,.48);
  border-radius: 24px;
  background:
    linear-gradient(110deg, rgba(181,18,25,.13), transparent),
    var(--surface, #111113);
}

.availability-panel .button {
  margin-top: .8rem;
}

.final-cta {
  padding-top: 2rem;
}

.final-cta-panel {
  grid-template-columns: minmax(0,1fr) auto;
}

.final-cta-panel p {
  margin-bottom: 0;
}

@media (max-width: 1050px) {
  .journey-index-grid {
    grid-template-columns: repeat(2, minmax(0,1fr));
  }

  .journey-layout,
  .earned-standard-grid,
  .availability-panel {
    grid-template-columns: 1fr;
  }

  .journey-layout-reverse .journey-media {
    order: 0;
  }

  .journey-media {
    min-height: 500px;
  }
}

@media (max-width: 700px) {
  .journeys-hero {
    min-height: 700px;
  }

  .journeys-hero h1 {
    font-size: clamp(3.1rem, 15vw, 5rem);
  }

  .journey-index-grid,
  .journey-details-grid,
  .final-cta-panel {
    grid-template-columns: 1fr;
  }

  .journey-media {
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
    print("Journeys page build complete.")
    print()
    print("Image paths already wired:")
    print("  assets/images/hero/hero-journeys-en.png")
    print("  assets/images/hero/hero-journeys-es.png")
    print("  assets/images/journeys/zero2hero-journey.png")
    print("  assets/images/journeys/path2legend-journey.png")
    print("  assets/images/journeys/quest2mastery-journey.png")
    print("  assets/images/journeys/hiit-fit-journey.png")


if __name__ == "__main__":
    main()
