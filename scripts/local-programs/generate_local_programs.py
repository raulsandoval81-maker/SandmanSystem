from pathlib import Path
import shutil

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

    # Eyebrow / journey identity
    html = html.replace(
        "Foundry 8 • Zero2Hero™ • Ages 7–13",
        f"{name} • Zero2Hero™ • Ages 7–13",
    )

    html = html.replace(
        "Foundry 8 • Zero2Hero™ • Edades 7–13",
        f"{name_es} • Zero2Hero™ • Edades 7–13",
    )

    html = html.replace(
        "Foundry 4 • Path2Legend™ • Ages 14+",
        f"{name} • Path2Legend™ • Ages 14+",
    )

    html = html.replace(
        "Foundry 4 • Path2Legend™ • Edades 14+",
        f"{name_es} • Path2Legend™ • Edades 14+",
    )

    return html


# =========================================================
# GENERATOR
# =========================================================

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
