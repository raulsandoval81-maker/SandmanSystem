from pathlib import Path

# ---------- Journeys ----------

journeys = Path("public/journeys.html")

html = journeys.read_text(encoding="utf-8")

hero = """
<section class="journeys-hero" aria-label="Three Sandman journeys">

  <div class="journeys-hotspot-wrap">

    <img
      src="/assets/img/pages/journeys/hero-en.png"
      alt="Three Journeys. One Mission."
      data-lang-block="en"
    />

    <img
      src="/assets/img/pages/journeys/hero-es.png"
      alt="Tres Caminos. Una Misión."
      data-lang-block="es"
      class="hidden-lang"
    />

    <a class="journey-hotspot z2h" href="#zero2hero" aria-label="Zero2Hero"></a>
    <a class="journey-hotspot p2l" href="#path2legend" aria-label="Path2Legend"></a>
    <a class="journey-hotspot q2m" href="#quest2mastery" aria-label="Quest2Mastery"></a>

  </div>

</section>
"""

start = html.find('<section class="journeys-hero"')
end = html.find("</section>", start) + len("</section>")

html = html[:start] + hero + html[end:]

journeys.write_text(html, encoding="utf-8")

print("✓ Journeys hotspots installed")


# ---------- System ----------

system = Path("public/system.html")

html = system.read_text(encoding="utf-8")

hero = """
<section class="system-hero">

  <div class="system-hotspot-wrap">

    <img
      src="/assets/img/pages/system/hero-system-en.png"
      alt="The Sandman Method"
      data-lang-block="en"
    />

    <img
      src="/assets/img/pages/system/hero-system-es.png"
      alt="El Método Sandman"
      data-lang-block="es"
      class="hidden-lang"
    />

    <a class="pillar-hotspot combat" href="#combat"></a>
    <a class="pillar-hotspot strength" href="#strength"></a>
    <a class="pillar-hotspot honor" href="#honor"></a>

  </div>

</section>
"""

start = html.find('<section class="system-hero"')
end = html.find("</section>", start) + len("</section>")

html = html[:start] + hero + html[end:]

system.write_text(html, encoding="utf-8")

print("✓ System hotspots installed")
