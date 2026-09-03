from pathlib import Path
import argparse
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
PUBLIC = ROOT / "public"


# =========================================================
# LOCATION CONFIG
# =========================================================

ACADEMIES = {
    "santa-ynez-valley": {
        "name": "Santa Ynez Valley",
        "name_es": "Valle de Santa Ynez",
        "connect_url":
            "/connect/interest/?academy=sandman&location=santa-ynez-valley",

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

        "fitness": {
            "enabled": True,
            "everyday_fitness": True,
            "classes": [
                "strength-conditioning",
                "kickboxing-self-defense",
                "boxing-self-defense",
            ],
            "drop_in": 15,
            "drop_in_rolls_to_enrollment": True,
            "remote_training": "fuelai",
        },
    },

    "lompoc": {
        "name": "Lompoc",
        "name_es": "Lompoc",
        "connect_url":
            "/connect/interest/?academy=sandman&location=lompoc",

        "programs": {
            "zero2hero": [
                "wrestling",
            ],
            "path2legend": [
                "wrestling",
            ],
            "quest2mastery": [],
        },

        "fitness": {
            "enabled": True,
            "everyday_fitness": True,
            "classes": [
                "strength-conditioning",
                "kickboxing-self-defense",
                "boxing-self-defense",
            ],
            "drop_in": 15,
            "drop_in_rolls_to_enrollment": True,
            "remote_training": "fuelai",
        },
    },

    "elk-grove": {
        "name": "Elk Grove",
        "name_es": "Elk Grove",
        "connect_url":
            "/connect/interest/?academy=sandman&location=elk-grove",

        "programs": {
            "zero2hero": [
                "boxing",
                "wrestling",
                "muay-thai",
            ],
            "path2legend": [
                "boxing",
                "wrestling",
                "muay-thai",
            ],
            "quest2mastery": [
                "mma",
                "submission-grappling",
            ],
        },

        "fitness": {
            "enabled": True,

            # Visual support exists, but do not advertise local
            # Everyday Fitness classes or pricing until enabled.
            "everyday_fitness": False,
            "classes": [],
            "drop_in": None,
            "drop_in_rolls_to_enrollment": False,
            "remote_training": "fuelai",
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
    # not repeated as a visible progression eyebrow.
    # The discipline page already establishes local context.


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



JOURNEY_META = {
    "zero2hero": {
        "label": "Road2Champion™",
        "family": "Sandman Zero2Hero™ Programs",
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


# Public output slugs remain canonical even when a legacy library filename
# differs. Every mismatch must be declared here so preflight can fail closed
# on accidental or newly introduced source/config drift.
SOURCE_FILE_ALIASES = {
    ("quest2mastery", "submission-grappling"): "sub-grappling",
}


PROGRESSION_ASSETS = {
    ("zero2hero", "boxing"):
        "/assets/images/programs/shirt-progression/"
        "road2champion-boxing-shirt-progression.png",
    ("zero2hero", "muay-thai"):
        "/assets/images/programs/shirt-progression/"
        "road2champion-muay-thai-shirt-progression.png",
    ("zero2hero", "wrestling"):
        "/assets/images/programs/shirt-progression/"
        "road2champion-wrestling-shirt-progression.png",
    ("path2legend", "boxing"):
        "/assets/images/programs/shirt-progression/"
        "path2legend-boxing-shirt-progression.png",
    ("path2legend", "muay-thai"):
        "/assets/images/programs/shirt-progression/"
        "path2legend-muay-thai-shirt-progression.png",
    ("path2legend", "wrestling"):
        "/assets/images/programs/shirt-progression/"
        "path2legend-wrestling-shirt-progression.png",
    ("quest2mastery", "mma"):
        "/assets/images/programs/shirt-progression/"
        "quest2mastery-mma-shirt-progression.png",
    ("quest2mastery", "submission-grappling"):
        "/assets/images/programs/shirt-progression/"
        "quest2mastery-submission-grappling-shirt-progression.png",
}


def source_path_for(journey, discipline):
    source_slug = SOURCE_FILE_ALIASES.get(
        (journey, discipline),
        discipline,
    )
    return LIBRARY / journey / f"{source_slug}.html"


def validate_generation_sources():
    """Validate the full configured source inventory before any output."""
    errors = []
    configured_pairs = set()

    for location_slug, academy in ACADEMIES.items():
        programs = academy.get("programs", {})

        for journey, disciplines in programs.items():
            if journey not in JOURNEY_META:
                errors.append(
                    f"{location_slug}: unknown journey key: {journey}"
                )

            if len(disciplines) != len(set(disciplines)):
                errors.append(
                    f"{location_slug}/{journey}: duplicate discipline slug"
                )

            for discipline in disciplines:
                if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", discipline):
                    errors.append(
                        f"{location_slug}/{journey}: invalid discipline slug: "
                        f"{discipline}"
                    )
                    continue

                configured_pairs.add((journey, discipline))
                source = source_path_for(journey, discipline)

                if not source.is_file():
                    errors.append(
                        f"{location_slug}/{journey}/{discipline}: "
                        f"missing source: {source}"
                    )
                    continue

                expected_asset = PROGRESSION_ASSETS.get(
                    (journey, discipline)
                )
                if not expected_asset:
                    errors.append(
                        f"{journey}/{discipline}: missing progression "
                        "asset mapping"
                    )
                    continue

                asset_path = PUBLIC / expected_asset.lstrip("/")
                if not asset_path.is_file():
                    errors.append(
                        f"{journey}/{discipline}: missing progression "
                        f"asset: {asset_path}"
                    )

                source_html = source.read_text()
                if expected_asset not in source_html:
                    errors.append(
                        f"{journey}/{discipline}: source does not use "
                        f"canonical progression asset: {expected_asset}"
                    )

    unused_aliases = set(SOURCE_FILE_ALIASES) - configured_pairs
    for journey, discipline in sorted(unused_aliases):
        errors.append(
            f"unused source alias: {journey}/{discipline}"
        )

    alias_targets = {}
    for output_pair, source_slug in SOURCE_FILE_ALIASES.items():
        journey, discipline = output_pair
        source_pair = (journey, source_slug)
        previous = alias_targets.get(source_pair)
        if previous and previous != discipline:
            errors.append(
                f"duplicate source alias target: {journey}/{source_slug}"
            )
        alias_targets[source_pair] = discipline

    if errors:
        raise RuntimeError(
            "Local program source preflight failed:\n- "
            + "\n- ".join(errors)
        )

    return configured_pairs


# =========================================================
# SANDMAN_LOCAL_PROGRAM_PRESENTATION_ENGINE
#
# Universal library pages remain neutral.
# This layer applies academy-specific presentation when
# local discipline pages are generated.
# =========================================================



def polish_local_program_html(
    html,
    academy,
    journey,
    discipline,
):
    """
    Canonical local discipline-page presentation:

    neutral discipline hero
    -> discipline content
    -> training focus
    -> journey progression
    -> shirt/rank progression
    -> athlete fit

    Academy-level cultural imagery such as ___ IS LIFE
    or COMBAT IS LIFE belongs on the local academy front
    door, not on local program-detail pages.
    """


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
            r'(?:[^<]*?(?:Zero2Hero|Road2Champion|Path2Legend|Quest2Mastery)™'
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
    # CENTER ALL DISCIPLINE-PAGE TITLES
    # ---------------------------------------------

    marker = "SANDMAN-DISCIPLINE-HERO-CENTER"

    if marker not in html and "</head>" in html:
        style = f"""
  <style id="{marker}">
    .hero,
    .hero h1,
    .hero .hero-subtitle,
    .hero > div > p {{
      text-align: center;
    }}

    .hero > div {{
      margin-left: auto;
      margin-right: auto;
    }}
  </style>
"""

        html = html.replace(
            "</head>",
            style + "\n</head>",
            1,
        )


    return html


def install_local_interior_shell(html, slug):
    """Replace the legacy discipline header with the local interior shell."""
    html, css_count = re.subn(
        r'\n/\*\s*=+\s*\n\s*MINIMAL JOURNEY HEADER.*?'
        r'(?=\n\s*</style>)',
        "",
        html,
        count=1,
        flags=re.I | re.S,
    )

    navigation = f'''<div
  id="navigation"
  data-component="/locations/{slug}/components/navigation.html"
></div>'''

    html, header_count = re.subn(
        r'<header class="journey-minimal-header">.*?</header>',
        navigation,
        html,
        count=1,
        flags=re.I | re.S,
    )

    if css_count != 1 or header_count != 1:
        raise RuntimeError(
            f"STOP: legacy discipline shell mismatch for {slug}; "
            f"css={css_count}, header={header_count}"
        )

    if "journey-minimal-header" in html:
        raise RuntimeError(
            f"STOP: legacy discipline shell remains for {slug}"
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
            source = source_path_for(journey, discipline)
            destination = (
                destination_dir
                / f"{discipline}.html"
            )

            html = source.read_text()
            html = localize_html(
                html,
                academy,
            )

            html = install_local_interior_shell(
                html,
                slug,
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



# ============================================================
# SANDMAN_LOCAL_FRONT_DOOR_CULTURE
#
# Canonical local public shell:
#
# HOME
#   1. Universal Sandman System culture:
#        COMBAT IS LIFE
#        FOCUS • EFFORT • ATTITUDE • RESPECT
#
#   2. Academy-specific offering visual:
#        Santa Ynez → Wrestling + Boxing + Muay Thai
#        Lompoc     → Wrestling
#        Elk Grove  → Boxing
#
#   3. Explore Fitness hotspot:
#        → local /fitness.html
#
# FITNESS
#   Local academy remains the front door.
#   FuelAI is the remote-training option inside fitness.html.
#
# ABOUT
#   System/About hero stays above Combat = Character.
#
# Discipline-specific ___ IS LIFE graphics are not generated
# inside local discipline-detail pages.
# ============================================================

LOCAL_FRONT_DOOR_CULTURE = {
    "en": "/assets/img/discipline-life/combat-is-life-en.png",
    "es": "/assets/img/discipline-life/combat-is-life-es.png",
}


LOCAL_PUBLIC_CONFIG = {
    "santa-ynez-valley": {
        "offering_en":
            "/assets/img/pages/home/"
            "home-wrestling-boxing-muay-thai-en.png",

        "offering_es":
            "/assets/img/pages/home/"
            "home-wrestling-boxing-muay-thai-es.png",
    },

    "lompoc": {
        "offering_en":
            "/assets/img/pages/home/home-wrestling-en.png",

        "offering_es":
            "/assets/img/pages/home/home-wrestling-es.png",
    },

    "elk-grove": {
        "offering_en":
            "/assets/img/pages/home/home-boxing-en.png",

        "offering_es":
            "/assets/img/pages/home/home-boxing-es.png",
    },
}


def enforce_local_front_door_culture():
    """
    Enforce the canonical local public home shell.

    This intentionally operates only on configured academies.
    """

    for slug, config in LOCAL_PUBLIC_CONFIG.items():

        index_path = LOCATIONS / slug / "index.html"

        if not index_path.exists():
            print(f"SKIP: local home missing: {slug}")
            continue

        html = index_path.read_text()

        # ----------------------------------------------------
        # 0. HOME HERO SEPARATOR
        #    Immediately before the first homepage visual.
        # ----------------------------------------------------

        separator = """
    <div
      class="home-hero-separator"
      aria-hidden="true"
    ></div>
"""

        # Remove an existing separator first so generation is
        # idempotent and can safely correct older placement.
        html = re.sub(
            r'\s*<div\s+'
            r'class="home-hero-separator"\s+'
            r'aria-hidden="true"\s*'
            r'></div>\s*',
            "\n",
            html,
            count=1,
            flags=re.S,
        )

        main_pos = html.find("<main")

        if main_pos == -1:
            raise RuntimeError(
                f"STOP: <main> not found for {slug}"
            )

        first_img = html.find("<img", main_pos)

        if first_img == -1:
            raise RuntimeError(
                f"STOP: first homepage image not found for {slug}"
            )

        first_section = html.rfind(
            "<section",
            main_pos,
            first_img,
        )

        if first_section == -1:
            raise RuntimeError(
                f"STOP: first visual section not found for {slug}"
            )

        html = (
            html[:first_section].rstrip()
            + "\n\n"
            + separator
            + "\n"
            + html[first_section:].lstrip()
        )


        # ----------------------------------------------------
        # 1. UNIVERSAL CULTURE HERO
        # ----------------------------------------------------

        hero_replacements = {
            "/assets/img/pages/home/hero-home-env2.png":
                LOCAL_FRONT_DOOR_CULTURE["en"],

            "/assets/img/pages/home/hero-home-esv2.png":
                LOCAL_FRONT_DOOR_CULTURE["es"],

            "/assets/img/discipline-life/wrestling-is-life-en.png":
                LOCAL_FRONT_DOOR_CULTURE["en"],

            "/assets/img/discipline-life/wrestling-is-life-es.png":
                LOCAL_FRONT_DOOR_CULTURE["es"],

            "/assets/img/discipline-life/boxing-is-life-en.png":
                LOCAL_FRONT_DOOR_CULTURE["en"],

            "/assets/img/discipline-life/boxing-is-life-es.png":
                LOCAL_FRONT_DOOR_CULTURE["es"],
        }

        for old, new in hero_replacements.items():
            html = html.replace(old, new)


        # ----------------------------------------------------
        # 2. LOCATION-SPECIFIC OFFERING PNG
        # ----------------------------------------------------

        en_section = re.compile(
            r'(<section\b[^>]*class="home-many-paths"'
            r'[^>]*data-lang-block="en"[^>]*>.*?'
            r'<img\b[^>]*src=")[^"]+(")',
            re.S,
        )

        es_section = re.compile(
            r'(<section\b[^>]*class="home-many-paths'
            r'[^"]*"[^>]*data-lang-block="es"[^>]*>.*?'
            r'<img\b[^>]*src=")[^"]+(")',
            re.S,
        )

        html, en_count = en_section.subn(
            rf'\1{config["offering_en"]}\2',
            html,
            count=1,
        )

        html, es_count = es_section.subn(
            rf'\1{config["offering_es"]}\2',
            html,
            count=1,
        )

        if en_count != 1 or es_count != 1:
            raise RuntimeError(
                f"STOP: offering visual not found for {slug}"
            )


        # ----------------------------------------------------
        # 3. FITNESS HOTSPOTS STAY LOCAL
        # ----------------------------------------------------

        fitness_destination = (
            f"/locations/{slug}/fitness.html"
        )

        hotspot = re.compile(
            r'(<a\b[^>]*'
            r'class="home-many-paths__fitness-hotspot"'
            r'[^>]*href=")[^"]+(")',
            re.S,
        )

        html, hotspot_count = hotspot.subn(
            rf'\1{fitness_destination}\2',
            html,
        )

        if hotspot_count != 2:
            raise RuntimeError(
                f"STOP: expected 2 Fitness hotspots for "
                f"{slug}; found {hotspot_count}"
            )


        index_path.write_text(html)

        print(
            f"✓ {slug}: Combat Is Life"
            f" + local offering"
            f" + local Fitness"
        )


# END_SANDMAN_LOCAL_FRONT_DOOR_CULTURE

def main():
    global LOCATIONS

    parser = argparse.ArgumentParser(
        description="Generate Sandman local program pages."
    )

    parser.add_argument(
        "--write",
        action="store_true",
        help=(
            "Write generated pages into public/locations. "
            "Without this flag, generation is preview-only."
        ),
    )

    args = parser.parse_args()

    if not LIBRARY.exists():
        raise SystemExit(
            f"STOP: local program library missing: "
            f"{LIBRARY}"
        )

    configured_sources = validate_generation_sources()
    print(
        f"\n✓ Source preflight passed: "
        f"{len(configured_sources)} configured program sources"
    )

    if args.write:
        print(
            "\nWRITE MODE"
            "\nTarget: public/locations"
            "\n"
        )
    else:
        preview_root = Path(
            "/tmp/sandman-local-program-preview"
        )

        if preview_root.exists():
            shutil.rmtree(preview_root)

        LOCATIONS = preview_root / "locations"

        print(
            "\nPREVIEW MODE"
            "\nNo public files will be changed."
            f"\nTarget: {LOCATIONS}"
            "\n"
        )

    for slug, academy in ACADEMIES.items():
        generate_location(
            slug,
            academy,
        )

    # IMPORTANT:
    # The former home-many-paths/front-door generator is retired
    # from execution. Current local homepages use the approved
    # Combat / Strength / Honor hero and location discipline cards.
    #
    # Do not call enforce_local_front_door_culture() here.
    #
    # Future homepage / Programs / Fitness generation will be
    # rebuilt from ACADEMIES configuration after preview parity
    # with the approved public pages is established.

    if args.write:
        print(
            "\n✓ Local discipline generation complete"
            "\n✓ Public write mode used"
        )
    else:
        print(
            "\n✓ Local discipline preview complete"
            "\n✓ Public files untouched"
        )


if __name__ == "__main__":
    main()

# ============================================================
# SANDMAN_LOCAL_DISCIPLINE_STRUCTURE
#
# Canonical generated local discipline-page flow:
#
#   HERO
#     discipline title
#     discipline subtitle
#     discipline introduction
#     availability copy
#
#   DISCIPLINE OVERVIEW
#
#   WHY SANDMAN TEACHES THE DISCIPLINE
#
#   HISTORY / FACTS
#
#   TECHNICAL DEVELOPMENT
#   PHYSICAL DEVELOPMENT
#   CHARACTER DEVELOPMENT
#   TRAINING FOCUS
#
#   JOURNEY PROGRESSION
#     Zero2Hero / Path2Legend / Quest2Mastery
#     progression explanation
#     shirt / rank progression PNG
#
#     No visible "Earned Progression • Journey • Age • Location"
#     eyebrow. Local identity is already established by the page.
#
#   ATHLETE FIT
#
#   LOCAL CONNECTION CTA
#
# Academy-level cultural imagery such as COMBAT IS LIFE
# belongs on the local academy front door, not inside
# generated discipline-detail pages.
# ============================================================
