from pathlib import Path

FILE = Path("public-next/journeys.html")

if not FILE.exists():
    raise SystemExit("❌ Run this from the SandmanSystem root.")

text = FILE.read_text(encoding="utf-8")

# ----------------------------------------------------
# Add dormant program CSS (only once)
# ----------------------------------------------------

css_anchor = ".journey-purpose{"

if ".journey-program-dormant" not in text:
    text = text.replace(
        css_anchor,
        """
    .journey-program-dormant{
      opacity:.55;
      font-style:italic;
    }

    .journey-program-dormant strong{
      color:var(--muted);
    }

    .journey-availability{
      display:block;
      margin-top:.35rem;
      color:var(--silver);
      font-size:.9rem;
      font-style:italic;
    }

""" + css_anchor,
        1,
    )

# ----------------------------------------------------
# Zero2Hero
# ----------------------------------------------------

text = text.replace(
    """
<li>
<strong>Kickboxing</strong> — movement, coordination,
distance, and controlled striking fundamentals.
</li>
""",
    """
<li>
<strong>Muay Thai</strong> — movement, coordination,
distance, and controlled striking fundamentals.
</li>

<li class="journey-program-dormant">
<strong>Boxing</strong> — footwork, coordination,
timing, and controlled boxing fundamentals.

<span class="journey-availability">
Available at select academies.
</span>
</li>
""",
)

text = text.replace(
    """
<li>
<strong>Kickboxing</strong> — movimiento, coordinación,
distancia y fundamentos de golpeo controlado.
</li>
""",
    """
<li>
<strong>Muay Thai</strong> — movimiento, coordinación,
distancia y fundamentos de golpeo controlado.
</li>

<li class="journey-program-dormant">
<strong>Boxeo</strong> — juego de pies, coordinación,
ritmo y fundamentos controlados de boxeo.

<span class="journey-availability">
Disponible en academias seleccionadas.
</span>
</li>
""",
)

# ----------------------------------------------------
# Path2Legend
# ----------------------------------------------------

path_en = """
</li>

</ul>
"""

path_en_new = """
</li>

<li class="journey-program-dormant">
<strong>Muay Thai</strong> — timing, footwork,
conditioning, pressure, and composure.

<span class="journey-availability">
Available at select academies.
</span>
</li>

</ul>
"""

text = text.replace(path_en, path_en_new, 1)

path_es = """
</li>

</ul>
"""

path_es_new = """
</li>

<li class="journey-program-dormant">
<strong>Muay Thai</strong> — ritmo, juego de pies,
acondicionamiento, presión y compostura.

<span class="journey-availability">
Disponible en academias seleccionadas.
</span>
</li>

</ul>
"""

text = text.replace(path_es, path_es_new, 1)

FILE.write_text(text, encoding="utf-8")

print("✅ Journey disciplines updated.")
print("✅ Zero2Hero = Wrestling • Muay Thai • Boxing (dormant)")
print("✅ Path2Legend = Wrestling • Boxing • Muay Thai (dormant)")
