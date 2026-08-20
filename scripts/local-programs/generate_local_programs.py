from pathlib import Path
import shutil

import re
ROOT = Path(__file__).resolve().parents[2]

LIBRARY = (
    ROOT
    / "public"
    / "program-architecture"
    / "local-program-library"
)

LOCATIONS = ROOT / "public" / "locations"


# =========================================================
# LOCATION CONFIG
# =========================================================

ACADEMIES = {
    "santa-ynez-valley": {
        "name": "Santa Ynez Valley",
        "name_es": "Valle de Santa Ynez",
        "connect_url": "/locations/santa-ynez-valley/connect.html",

        "programs": {
            "zero2hero": [
                "wrestling",
                "muay-thai",
            ],

            "path2legend": [
                "wrestling",
                "boxing",
            ],

            "quest2mastery": [],
        },
    },
}


# =========================================================
# LOCALIZATION
# =========================================================

def localize_html(html, academy):
    name = academy["name"]
    name_es = academy["name_es"]
    connect_url = academy["connect_url"]

    # Generic academy availability
    html = html.replace(
        "Available at selected academies",
        f"Offered at our {name} academy",
    )

    html = html.replace(
        "Disponible en academias seleccionadas",
        f"Disponible en nuestra academia de {name_es}",
    )

    # Local header identity
    html = html.replace(
        "Sandman Academy of Combat &amp; Fitness",
        f"Sandman Academy • {name}",
        1,
    )

    # Local CTA
    html = html.replace(
        'href="/connect/interest/"',
        f'href="{connect_url}"',
    )

    html = html.replace(
        "Connect With Us",
        "Connect With Our Academy",
    )

    html = html.replace(
        "Conéctate con Nosotros",
        "Conéctate con Nuestra Academia",
    )

    # Journey / age / location metadata is intentionally
    # not localized into the hero here.
    # polish_local_program_html() moves that identity
    # into the earned-progression section.


    # --------------------------------------------------------
    # Local rally header identity
    #
    # Local pages do not repeat "Sandman Academy" in the
    # header. Community identity leads instead.
    # --------------------------------------------------------

    rally_en = local_rally_identity(academy, "en")
    rally_es = local_rally_identity(academy, "es")

    html = re.sub(
        rf"Sandman Academy\s*•\s*{re.escape(name)}",
        rally_en,
        html,
        flags=re.I,
    )

    html = re.sub(
        rf"(?:Academia Sandman|Sandman Academy)\s*•\s*"
        rf"{re.escape(name_es)}",
        rally_es,
        html,
        flags=re.I,
    )

    return html



# =========================================================
# SANDMAN_LOCAL_PROGRAM_PRESENTATION_ENGINE
#
# Universal library pages remain neutral.
# This layer applies academy-specific presentation when
# local discipline pages are generated.
# =========================================================

DISCIPLINE_LIFE_IMAGES = {
    "wrestling": {
        "en": "/assets/img/discipline-life/wrestling-is-life-en.png",
        "es": "/assets/img/discipline-life/wrestling-is-life-es.png",
        "alt_en": "Wrestling is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "La lucha es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "boxing": {
        "en": "/assets/img/discipline-life/boxing-is-life-en.png",
        "es": "/assets/img/discipline-life/boxing-is-life-es.png",
        "alt_en": "Boxing is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El boxeo es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "muay-thai": {
        "en": "/assets/img/discipline-life/muaythai-is-life-en.png",
        "es": "/assets/img/discipline-life/muaythai-is-life-es.png",
        "alt_en": "Muay Thai is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El Muay Thai es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "mma": {
        "en": "/assets/img/discipline-life/mma-is-life-en.png",
        "es": "/assets/img/discipline-life/mma-is-life-es.png",
        "alt_en": "Mixed Martial Arts is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "Las artes marciales mixtas son vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "submission-grappling": {
        "en": "/assets/img/discipline-life/submission-grappling-is-life-en.png",
        "es": "/assets/img/discipline-life/submission-grappling-is-life-es.png",
        "alt_en": "Submission Grappling is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El grappling de sumisión es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
}


JOURNEY_META = {
    "zero2hero": {
        "label": "Zero2Hero™",
        "age_en": "Ages 7–13",
        "age_es": "Edades 7–13",
    },
    "path2legend": {
        "label": "Path2Legend™",
        "age_en": "Ages 14+",
        "age_es": "Edades 14+",
    },
    "quest2mastery": {
        "label": "Quest2Mastery™",
        "age_en": "Ages 16+",
        "age_es": "Edades 16+",
    },
}


def discipline_life_splash(discipline):
    data = DISCIPLINE_LIFE_IMAGES.get(discipline)

    if not data:
        return ""

    return f"""
<section
  class="discipline-life-splash"
  data-discipline-life="{discipline}"
>
  <img
    src="{data['en']}"
    data-lang-src-en="{data['en']}"
    data-lang-src-es="{data['es']}"
    data-lang-alt-en="{data['alt_en']}"
    data-lang-alt-es="{data['alt_es']}"
    alt="{data['alt_en']}"
    loading="lazy"
  >
</section>
"""


def polish_local_program_html(
    html,
    academy,
    journey,
    discipline,
):
    """
    Canonical local discipline-page presentation:

    Life PNG
    -> neutral discipline hero
    -> discipline content
    -> earned progression with Journey / Age / Location
    -> shirt/rank progression
    """

    meta = JOURNEY_META.get(journey)

    if not meta:
        return html

    name = academy["name"]
    name_es = academy["name_es"]

    # ---------------------------------------------
    # HERO
    # Remove universal Foundry/journey eyebrow or
    # any previously localized equivalent.
    # ---------------------------------------------

    hero_match = re.search(
        r'<section class="hero">.*?</section>',
        html,
        flags=re.I | re.S,
    )

    if hero_match:
        hero = hero_match.group(0)

        hero = re.sub(
            r'\s*<p class="eyebrow">\s*'
            r'(?:Foundry\s*[48]\s*•\s*)?'
            r'(?:[^<]*?(?:Zero2Hero|Path2Legend|Quest2Mastery)™'
            r'[^<]*?)'
            r'\s*</p>\s*',
            "\n",
            hero,
            count=2,
            flags=re.I,
        )

        html = (
            html[:hero_match.start()]
            + hero
            + html[hero_match.end():]
        )

    # ---------------------------------------------
    # LIFE PNG
    # Exactly one splash, directly above hero.
    # ---------------------------------------------

    html = re.sub(
        r'\s*<section\s+class="discipline-life-splash".*?</section>\s*',
        "\n\n",
        html,
        flags=re.I | re.S,
    )

    splash = discipline_life_splash(discipline)

    hero_pos = html.find('<section class="hero">')

    if splash and hero_pos != -1:
        html = (
            html[:hero_pos]
            + splash
            + "\n\n"
            + html[hero_pos:]
        )

    # ---------------------------------------------
    # PROGRESSION
    # Local identity belongs here.
    # ---------------------------------------------

    en_line = (
        f"Earned Progression • "
        f"{meta['label']} • "
        f"{meta['age_en']} • "
        f"{name}"
    )

    es_line = (
        f"Progreso Ganado • "
        f"{meta['label']} • "
        f"{meta['age_es']} • "
        f"{name_es}"
    )

    html = re.sub(
        r'<p class="eyebrow">\s*'
        r'Earned Progression'
        r'(?:\s*•[^<]*)?'
        r'\s*</p>',
        f'<p class="eyebrow">{en_line}</p>',
        html,
        count=1,
        flags=re.I,
    )

    html = re.sub(
        r'<p class="eyebrow">\s*'
        r'Progreso Ganado'
        r'(?:\s*•[^<]*)?'
        r'\s*</p>',
        f'<p class="eyebrow">{es_line}</p>',
        html,
        count=1,
        flags=re.I,
    )

    # ---------------------------------------------
    # CENTER ALL DISCIPLINE-PAGE TITLES
    # ---------------------------------------------

    marker = "SANDMAN-DISCIPLINE-CENTERED-TITLES"

    if marker not in html and "</head>" in html:
        style = f"""
  <style id="{marker}">
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {{
      text-align: center;
    }}
  </style>
"""

        html = html.replace(
            "</head>",
            style + "\n</head>",
            1,
        )

    # ---------------------------------------------
    # LIFE PNG PRESENTATION
    # ---------------------------------------------

    life_style_marker = "SANDMAN-DISCIPLINE-LIFE-STYLE"

    if (
        life_style_marker not in html
        and "</head>" in html
    ):
        style = f"""
  <style id="{life_style_marker}">
    .discipline-life-splash {{
      width: min(100%, 900px);
      margin: 3rem auto;
      text-align: center;
    }}

    .discipline-life-splash img {{
      display: block;
      width: 100%;
      height: auto;
      margin: 0 auto;
    }}

    @media (max-width: 640px) {{
      .discipline-life-splash {{
        width: 100%;
        margin: 2.25rem auto;
      }}
    }}
  </style>
"""

        html = html.replace(
            "</head>",
            style + "\n</head>",
            1,
        )

    return html



# ============================================================
# SANDMAN_LOCAL_RALLY_IDENTITY
#
# Local academy pages lead with community ownership rather
# than repeating the global Sandman Academy identity.
#
# Pattern:
#   [LOCATION] STRONG
#   JOIN THE MOVEMENT.
#
# This applies ONLY to generated local academy pages.
# Platform/global Sandman branding remains unchanged.
# ============================================================

def local_rally_identity(academy, lang="en"):
    if lang == "es":
        return academy.get(
            "rally_name_es",
            (
            f'<span class="local-rally">'
            f'<span class="local-rally__place">{academy["name_es"]} Strong</span>'
            f'<span class="local-rally__dot" aria-hidden="true"> · </span>'
            f'<span class="local-rally__call">Únete al Movimiento</span>'
            f'</span>'
        ),
        )

    return academy.get(
        "rally_name",
        (
            f'<span class="local-rally">'
            f'<span class="local-rally__place">{academy["name"]} Strong</span>'
            f'<span class="local-rally__dot" aria-hidden="true"> · </span>'
            f'<span class="local-rally__call">Join the Movement</span>'
            f'</span>'
        ),
    )


def local_rally_tagline(lang="en"):
    if lang == "es":
        return "Únete al Movimiento."

    return "Join the Movement."


# =========================================================
# GENERATOR
# =========================================================


# SANDMAN_LOCAL_RALLY_RESPONSIVE_ENGINE
def add_local_rally_responsive_css(html):
    if "SANDMAN-LOCAL-RALLY-RESPONSIVE" in html:
        return html

    if 'class="local-rally"' not in html:
        return html

    css = """
<style id="SANDMAN-LOCAL-RALLY-RESPONSIVE">
  .local-rally {
    display: inline;
  }

  .local-rally__place,
  .local-rally__call {
    display: inline;
  }

  @media (max-width: 640px) {
    .local-rally {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.25;
    }

    .local-rally__place,
    .local-rally__call {
      display: block;
    }

    .local-rally__dot {
      display: block;
      width: 70%;
      height: 1px;
      margin: .35rem auto;
      overflow: hidden;
      font-size: 0;
      line-height: 0;
      background: currentColor;
      opacity: .35;
    }
  }
</style>
"""

    return html.replace(
        "</head>",
        css + "\n</head>",
        1,
    )


def generate_location(slug, academy):
    location_root = LOCATIONS / slug / "programs"

    print(f"\n===== {academy['name']} =====")

    for journey, disciplines in academy["programs"].items():

        if not disciplines:
            print(f"— {journey}: none")
            continue

        source_dir = LIBRARY / journey
        destination_dir = location_root / journey

        destination_dir.mkdir(
            parents=True,
            exist_ok=True,
        )

        for discipline in disciplines:
            source = source_dir / f"{discipline}.html"
            destination = (
                destination_dir
                / f"{discipline}.html"
            )

            if not source.exists():
                print(
                    f"WARNING: missing library file: "
                    f"{source}"
                )
                continue

            html = source.read_text()
            html = localize_html(
                html,
                academy,
            )

            html = add_local_rally_responsive_css(html)

            html = polish_local_program_html(
                html,
                academy,
                journey,
                discipline,
            )

            destination.write_text(html)

            print(
                f"✓ {journey}/{discipline}.html"
            )


def main():
    if not LIBRARY.exists():
        raise SystemExit(
            f"STOP: local program library missing: "
            f"{LIBRARY}"
        )

    for slug, academy in ACADEMIES.items():
        generate_location(
            slug,
            academy,
        )

    print("\n✓ Local program generation complete")


if __name__ == "__main__":
    main()

# ============================================================
# SANDMAN_CENTER_DISCIPLINE_TITLES
# Santa Ynez discipline-page presentation standard.
# Runs after generation so all existing and future discipline
# pages receive centered headings automatically.
# ============================================================

def enforce_santa_ynez_centered_titles():
    from pathlib import Path

    marker = "SANDMAN-DISCIPLINE-CENTERED-TITLES"

    style = f"""
  <style id="{marker}">
    /* Santa Ynez discipline-page standard:
       all titles centered, body copy unchanged */
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {{
      text-align: center;
    }}
  </style>
"""

    root = Path(
        "public/locations/santa-ynez-valley/programs"
    )

    if not root.exists():
        return

    for page in root.rglob("*.html"):
        html = page.read_text()

        if marker in html:
            continue

        if "</head>" not in html:
            continue

        html = html.replace(
            "</head>",
            style + "\n</head>",
            1
        )

        page.write_text(html)


enforce_santa_ynez_centered_titles()


# ============================================================
# SANDMAN_LOCAL_DISCIPLINE_STRUCTURE
#
# Canonical generated local discipline-page flow:
#
#   DISCIPLINE LIFE SPLASH
#     directly above hero
#     native EN/ES image synchronization
#
#   HERO
#     discipline title
#     discipline subtitle
#     discipline introduction
#     availability copy
#
#     Hero stays neutral.
#     No location / journey / age eyebrow.
#
#   DISCIPLINE OVERVIEW
#
#   WHY SANDMAN TEACHES THE DISCIPLINE
#
#   EARNED PROGRESSION
#     local context belongs here:
#
#     Earned Progression • Journey • Age • Location
#     Progreso Ganado • Journey • Edad • Ubicación
#
#   JOURNEY PROGRESSION
#   SHIRT / RANK PROGRESSION
#   REMAINING DISCIPLINE CONTENT
#
# Life PNG and shirt-progression PNG must remain separated.
# ============================================================

# ============================================================
# SANDMAN_DISCIPLINE_LIFE_SPLASH
# Native Sandman bilingual discipline culture image.
# Uses /assets/js/language.js data-lang-src system so the
# image stays synchronized with the site's saved EN/ES state.
# ============================================================

DISCIPLINE_LIFE_IMAGES = {
    "wrestling": {
        "en": "/assets/img/discipline-life/wrestling-is-life-en.png",
        "es": "/assets/img/discipline-life/wrestling-is-life-es.png",
        "alt_en": "Wrestling is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "La lucha es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "boxing": {
        "en": "/assets/img/discipline-life/boxing-is-life-en.png",
        "es": "/assets/img/discipline-life/boxing-is-life-es.png",
        "alt_en": "Boxing is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El boxeo es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "muay-thai": {
        "en": "/assets/img/discipline-life/muaythai-is-life-en.png",
        "es": "/assets/img/discipline-life/muaythai-is-life-es.png",
        "alt_en": "Muay Thai is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El Muay Thai es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "muaythai": {
        "en": "/assets/img/discipline-life/muaythai-is-life-en.png",
        "es": "/assets/img/discipline-life/muaythai-is-life-es.png",
        "alt_en": "Muay Thai is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El Muay Thai es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "mma": {
        "en": "/assets/img/discipline-life/mma-is-life-en.png",
        "es": "/assets/img/discipline-life/mma-is-life-es.png",
        "alt_en": "Mixed Martial Arts is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "Las artes marciales mixtas son vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
    "submission-grappling": {
        "en": "/assets/img/discipline-life/submission-grappling-is-life-en.png",
        "es": "/assets/img/discipline-life/submission-grappling-is-life-es.png",
        "alt_en": "Submission Grappling is life. These are the rules of life: Focus, Effort, Attitude, Respect.",
        "alt_es": "El grappling de sumisión es vida. Estas son las reglas de la vida: Enfoque, Esfuerzo, Actitud, Respeto.",
    },
}


def discipline_life_splash(discipline):
    slug = (
        str(discipline)
        .strip()
        .lower()
        .replace("_", "-")
        .replace(" ", "-")
    )

    d = DISCIPLINE_LIFE_IMAGES.get(slug)

    if not d:
        return ""

    return f"""
<section
  class="discipline-life-splash"
  data-discipline-life="{slug}"
>
  <img
    src="{d['en']}"
    data-lang-src-en="{d['en']}"
    data-lang-src-es="{d['es']}"
    data-lang-alt-en="{d['alt_en']}"
    data-lang-alt-es="{d['alt_es']}"
    alt="{d['alt_en']}"
    loading="lazy"
  >
</section>
"""

