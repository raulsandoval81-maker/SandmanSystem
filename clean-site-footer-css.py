from pathlib import Path
import re
import shutil
from datetime import datetime


CSS_FILE = Path("public-next/assets/css/site.css")

if not CSS_FILE.exists():
    raise SystemExit(
        f"❌ Could not find {CSS_FILE}\n"
        "Run this script from the SandmanSystem root."
    )


# ============================================================
# BACKUP
# ============================================================

timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
backup_file = CSS_FILE.with_name(
    f"site.css.before-footer-cleanup-{timestamp}"
)

shutil.copy2(CSS_FILE, backup_file)

text = CSS_FILE.read_text(encoding="utf-8")


# ============================================================
# 1. REMOVE THE EARLY LEGACY FOOTER BLOCK
# ============================================================

text, count_legacy = re.subn(
    r"""
    /\*\s*-+\s*Footer\s*-+\s*\*/
    .*?
    (?=/\*\s*-+\s*Utilities\s*-+\s*\*/)
    """,
    "",
    text,
    count=1,
    flags=re.DOTALL | re.VERBOSE,
)


# ============================================================
# 2. REMOVE THE OLD "STANDARD SITE FOOTER" GENERATION
# ============================================================

text, count_standard = re.subn(
    r"""
    /\*\s*=+\s*
    STANDARD\ SITE\ FOOTER
    \s*=+\s*\*/
    .*?
    (?=
      /\*\s*=+\s*
      SHARED\ HEADER
    )
    """,
    "",
    text,
    count=1,
    flags=re.DOTALL | re.VERBOSE,
)


# ============================================================
# 3. REMOVE THE MIDDLE FOOTER GENERATION
#
# This begins after the final header/theme rules and ends
# immediately before the Journeys-specific CSS.
# ============================================================

middle_footer_pattern = r"""
(?=
  \.site-footer__headquarters\s*\{
)
\.site-footer__headquarters\s*\{
.*?
(?=
  \.journeys-intro\s*\{
)
"""

text, count_middle = re.subn(
    middle_footer_pattern,
    "",
    text,
    count=1,
    flags=re.DOTALL | re.VERBOSE,
)


# ============================================================
# 4. REMOVE ALL LATER FOOTER EXPERIMENTS
#
# Everything after the first "MOBILE FOOTER COMPRESSION"
# heading is footer and homepage-hero override history.
# The homepage hero now belongs in home.css.
# ============================================================

late_footer_marker = (
    "/* =========================================\n"
    "   MOBILE FOOTER COMPRESSION"
)

marker_index = text.find(late_footer_marker)

if marker_index == -1:
    raise SystemExit(
        "❌ Could not find the late footer override marker.\n"
        "The file may have changed. No file was overwritten."
    )

text = text[:marker_index].rstrip()


# ============================================================
# 5. CLEAN UP EXCESS BLANK LINES
# ============================================================

text = re.sub(r"\n{4,}", "\n\n\n", text).rstrip()


# ============================================================
# 6. INSTALL ONE CLEAN FOOTER SYSTEM
# ============================================================

clean_footer_css = r"""

/* =========================================================
   SHARED SITE FOOTER — FINAL
   Desktop and mobile use the same west-to-east structure.
   ========================================================= */

.site-footer {
  padding: 0.9rem 1rem 0.55rem;
  color: #f5f5f5;
  background:
    linear-gradient(
      180deg,
      #07111f 0%,
      #03070d 100%
    );
  border-top: 1px solid rgba(255, 215, 70, 0.18);
}

/*
  The full academy name already appears in the header and hero.
  Hiding this prevents an extra grid row and keeps the footer compact.
*/
.site-footer__brand {
  display: none;
}

.site-footer__inner {
  width: min(1180px, 100%);
  margin: 0 auto;

  display: grid;
  grid-template-columns:
    minmax(0, 1fr)
    84px
    minmax(0, 1fr);

  grid-template-areas:
    "motto logo headquarters"
    "legal legal legal";

  align-items: center;
  gap: 0.55rem 1.25rem;
}


/* ---------- West: Motto ---------- */

.site-footer__seal {
  grid-area: motto;
  min-width: 0;
  margin: 0;
  text-align: left;
}

.site-footer__seal p {
  margin: 0;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}


/* ---------- Center: Shield ---------- */

.site-footer__logo {
  grid-area: logo;

  width: 84px;
  height: 84px;
  margin: 0 auto;

  display: flex;
  align-items: center;
  justify-content: center;
}

.site-footer__seal-image {
  display: block;

  width: 76px;
  max-width: none;
  height: 76px;

  margin: 0;
  object-fit: contain;

  filter:
    drop-shadow(
      0 8px 18px rgba(0, 0, 0, 0.45)
    );
}


/* ---------- East: Headquarters ---------- */

.site-footer__headquarters {
  grid-area: headquarters;
  min-width: 0;

  margin: 0;
  padding: 0;
  border: 0;

  text-align: right;
}

.site-footer__headquarters strong {
  display: block;

  margin: 0 0 0.15rem;

  color: #d4af37;
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.site-footer__headquarters p {
  margin: 0;

  color: rgba(255, 255, 255, 0.78);
  font-size: 0.74rem;
  line-height: 1.25;
}

.site-footer__headquarters small {
  display: block;

  margin-top: 0.15rem;

  color: rgba(255, 255, 255, 0.58);
  font-size: 0.63rem;
  line-height: 1.2;
}


/* ---------- Bottom: Legal ---------- */

.site-footer__legal {
  grid-area: legal;

  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;

  gap: 0.15rem 0.4rem;

  margin: 0.1rem 0 0;
  padding-top: 0.4rem;

  color: rgba(255, 255, 255, 0.46);
  font-size: 0.58rem;
  line-height: 1.15;
  text-align: center;

  border-top: 1px solid rgba(255, 255, 255, 0.08);
}


/* =========================================================
   SHARED SITE FOOTER — MOBILE
   Keep the same west → center → east arrangement.
   ========================================================= */

@media (max-width: 768px) {

  .site-footer {
    padding:
      0.7rem
      0.6rem
      0.45rem;
  }

  .site-footer__inner {
    width: 100%;

    grid-template-columns:
      minmax(0, 0.9fr)
      64px
      minmax(0, 1.35fr);

    grid-template-areas:
      "motto logo headquarters"
      "legal legal legal";

    gap: 0.35rem 0.55rem;
  }

  .site-footer__seal {
    text-align: left;
  }

  .site-footer__seal p {
    font-size: 0.58rem;
    line-height: 1.15;
    letter-spacing: 0.055em;
  }

  .site-footer__logo {
    width: 64px;
    height: 64px;
  }

  .site-footer__seal-image {
    width: 58px;
    height: 58px;
  }

  .site-footer__headquarters {
    text-align: right;
  }

  .site-footer__headquarters strong {
    margin-bottom: 0.08rem;
    font-size: 0.56rem;
    letter-spacing: 0.07em;
  }

  .site-footer__headquarters p {
    font-size: 0.6rem;
    line-height: 1.18;
  }

  .site-footer__headquarters small {
    margin-top: 0.08rem;
    font-size: 0.51rem;
    line-height: 1.12;
  }

  .site-footer__legal {
    margin-top: 0.08rem;
    padding-top: 0.3rem;

    gap: 0.1rem 0.25rem;

    font-size: 0.5rem;
    line-height: 1.1;
  }
}


/* =========================================================
   SHARED SITE FOOTER — VERY SMALL PHONES
   ========================================================= */

@media (max-width: 390px) {

  .site-footer__inner {
    grid-template-columns:
      minmax(0, 0.85fr)
      56px
      minmax(0, 1.4fr);

    gap: 0.3rem 0.42rem;
  }

  .site-footer__logo {
    width: 56px;
    height: 56px;
  }

  .site-footer__seal-image {
    width: 52px;
    height: 52px;
  }

  .site-footer__seal p {
    font-size: 0.53rem;
  }

  .site-footer__headquarters p {
    font-size: 0.56rem;
  }
}
"""

text = f"{text}\n{clean_footer_css.strip()}\n"


# ============================================================
# 7. VALIDATE THE RESULT BEFORE WRITING
# ============================================================

required_selectors = [
    ".site-footer {",
    ".site-footer__inner {",
    ".site-footer__logo {",
    ".site-footer__seal-image {",
    ".site-footer__headquarters {",
    ".site-footer__legal {",
]

for selector in required_selectors:
    if selector not in text:
        raise SystemExit(
            f"❌ Validation failed. Missing selector: {selector}\n"
            "The original file remains backed up."
        )


footer_image_count = text.count(".site-footer__seal-image {")

if footer_image_count != 2:
    raise SystemExit(
        "❌ Cleanup validation failed.\n"
        f"Expected 2 shield-image rules "
        f"(base + mobile), found {footer_image_count}."
    )


CSS_FILE.write_text(text, encoding="utf-8")


# ============================================================
# REPORT
# ============================================================

print("✅ site.css footer cleanup completed.")
print(f"✅ Backup created: {backup_file}")
print(f"✅ Removed early legacy footer block: {count_legacy}")
print(f"✅ Removed standard footer generation: {count_standard}")
print(f"✅ Removed middle footer generation: {count_middle}")
print("✅ Removed all accumulated late footer overrides.")
print("✅ Removed homepage hero overrides from site.css.")
print("✅ Installed one desktop/mobile footer system.")
print("✅ Desktop shield: 76px, centered.")
print("✅ Mobile shield: 58px, centered.")
