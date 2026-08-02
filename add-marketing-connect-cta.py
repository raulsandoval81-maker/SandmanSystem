from pathlib import Path

# ============================================================
# TARGET FILES
# ============================================================
#
# Included:
# - Journey index pages
# - Individual combat-discipline pages
# - Fitness index and individual fitness-program pages
#
# Excluded:
# - public/marketing/index.html (coach-only sharing tool)
# - public/marketing/fitness/schedule.html
# - public/marketing/_archive/*
#

TARGETS = [
    # FITNESS
    Path("public/marketing/fitness/index.html"),
    Path("public/marketing/fitness/hitfit.html"),
    Path("public/marketing/fitness/youth-fitness.html"),
    Path("public/marketing/fitness/teenfit-boxing.html"),
    Path("public/marketing/fitness/jumpstart-fitness.html"),
    Path("public/marketing/fitness/dawn-patrol.html"),
    Path("public/marketing/fitness/preschool-playtime.html"),
    Path("public/marketing/fitness/powerlifting.html"),

    # ZERO2HERO
    Path("public/marketing/foundry8-z2h/index.html"),
    Path("public/marketing/foundry8-z2h/wrestling.html"),
    Path("public/marketing/foundry8-z2h/boxing.html"),
    Path("public/marketing/foundry8-z2h/muay-thai.html"),

    # PATH2LEGEND
    Path("public/marketing/foundry4-p2l/index.html"),
    Path("public/marketing/foundry4-p2l/wrestling.html"),
    Path("public/marketing/foundry4-p2l/boxing.html"),
    Path("public/marketing/foundry4-p2l/muay-thai.html"),

    # QUEST2MASTERY
    Path("public/marketing/foundry4-q2m/index.html"),
    Path("public/marketing/foundry4-q2m/mma.html"),
    Path("public/marketing/foundry4-q2m/sub-grappling.html"),
]

STYLE_MARKER = "MARKETING CONNECT CTA STYLES"
SECTION_MARKER = "MARKETING CONNECT CTA"

CTA_STYLES = """
    /* =====================================================
       MARKETING CONNECT CTA STYLES
    ====================================================== */

    .marketing-connect-cta{
      width:100%;
      margin-top:34px;
      padding:clamp(2rem, 5vw, 3.4rem) clamp(1.25rem, 4vw, 2.5rem);

      text-align:center;

      border:1px solid rgba(212,175,55,.38);
      border-radius:22px;

      background:
        radial-gradient(
          circle at top,
          rgba(212,175,55,.14),
          transparent 42%
        ),
        linear-gradient(
          180deg,
          #171717 0%,
          #090909 100%
        );

      box-shadow:0 18px 38px rgba(0,0,0,.30);
    }

    .marketing-connect-cta h2{
      margin:0 0 .8rem;

      color:#ffffff;

      font-size:clamp(1.85rem, 4vw, 2.8rem);
      line-height:1.1;
    }

    .marketing-connect-cta p{
      max-width:700px;

      margin:0 auto 1.45rem;

      color:#d4d4d8;

      font-size:1rem;
      line-height:1.7;
    }

    .marketing-connect-cta .journeys-cta-button{
      display:inline-flex;
      align-items:center;
      justify-content:center;

      min-height:50px;

      padding:13px 24px;

      color:#090909;
      background:#d4af37;

      border:1px solid #e7c968;
      border-radius:999px;

      font-weight:900;
      line-height:1.2;
      text-align:center;
      text-decoration:none;

      transition:
        transform .18s ease,
        background-color .18s ease,
        box-shadow .18s ease;
    }

    .marketing-connect-cta .journeys-cta-button:hover,
    .marketing-connect-cta .journeys-cta-button:focus-visible{
      background:#e2c25a;

      box-shadow:0 10px 28px rgba(212,175,55,.24);

      transform:translateY(-2px);
      outline:none;
    }

    body.day-mode .marketing-connect-cta{
      border-color:#c9aa61;

      background:
        radial-gradient(
          circle at top,
          rgba(173,123,35,.12),
          transparent 42%
        ),
        linear-gradient(
          180deg,
          #ffffff 0%,
          #f3e7cf 100%
        );

      box-shadow:0 10px 24px rgba(0,0,0,.10);
    }

    body.day-mode .marketing-connect-cta h2{
      color:#171717;
    }

    body.day-mode .marketing-connect-cta p{
      color:#4b5563;
    }

    @media (max-width:640px){
      .marketing-connect-cta{
        margin-top:28px;
        padding:2rem 1rem;
        border-radius:17px;
      }

      .marketing-connect-cta .journeys-cta-button{
        width:100%;
        max-width:340px;
      }
    }
"""

CTA_SECTION = """
    <!-- =====================================================
         MARKETING CONNECT CTA
    ====================================================== -->

    <section class="marketing-connect-cta">

      <div data-lang-block="en">

        <h2>Ready to Begin?</h2>

        <p>
          Tell us about your goals and let us help you find the Sandman
          program and journey that are right for you.
        </p>

        <a
          class="journeys-cta-button"
          href="/connect/interest/"
        >
          Connect With Us
        </a>

      </div>

      <div
        data-lang-block="es"
        class="hidden-lang"
      >

        <h2>¿Listo para Comenzar?</h2>

        <p>
          Cuéntanos sobre tus objetivos y permítenos ayudarte a encontrar
          el programa y el camino Sandman adecuados para ti.
        </p>

        <a
          class="journeys-cta-button"
          href="/connect/interest/"
        >
          Conéctate con Nosotros
        </a>

      </div>

    </section>
"""


def add_styles(html: str, path: Path) -> str:
    """Add CTA styles before </style> or </head>."""

    if STYLE_MARKER in html:
        return html

    style_end = html.rfind("</style>")

    if style_end != -1:
        return html[:style_end] + CTA_STYLES + "\n  " + html[style_end:]

    head_end = html.rfind("</head>")

    if head_end != -1:
        style_block = "\n  <style>\n" + CTA_STYLES + "\n  </style>\n"
        return html[:head_end] + style_block + html[head_end:]

    raise ValueError(f"Could not locate </style> or </head> in {path}")


def add_cta(html: str, path: Path) -> str:
    """Add the CTA before </main>."""

    if SECTION_MARKER in html:
        return html

    main_end = html.rfind("</main>")

    if main_end == -1:
        raise ValueError(f"Could not locate </main> in {path}")

    return html[:main_end] + CTA_SECTION + "\n  " + html[main_end:]


def update_file(path: Path) -> None:
    if not path.exists():
        print(f"⚠️  Missing: {path}")
        return

    original = path.read_text(encoding="utf-8")
    updated = original

    try:
        updated = add_styles(updated, path)
        updated = add_cta(updated, path)
    except ValueError as error:
        print(f"❌ {error}")
        return

    if updated == original:
        print(f"⏭️  Already updated: {path}")
        return

    backup = path.with_suffix(path.suffix + ".before-connect-cta")

    if not backup.exists():
        backup.write_text(original, encoding="utf-8")

    path.write_text(updated, encoding="utf-8")

    print(f"✅ Updated: {path}")


def main() -> None:
    print("\nAdding Connect With Us CTA to marketing pages...\n")

    for target in TARGETS:
        update_file(target)

    print("\nDone.")
    print("Backups use the extension: .html.before-connect-cta")
    print("The coach-only public/marketing/index.html was not changed.")
    print("The schedule and archive pages were not changed.\n")


if __name__ == "__main__":
    main()
