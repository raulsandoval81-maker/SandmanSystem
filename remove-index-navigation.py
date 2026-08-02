from pathlib import Path

FILES = [
    "public/marketing/foundry8-z2h/index.html",
    "public/marketing/foundry4-p2l/index.html",
    "public/marketing/foundry4-q2m/index.html",
]

NEW_HEADER = """
<header class="journey-minimal-header">

  <button
    class="journey-back-button"
    type="button"
    onclick="history.back()"
    aria-label="Go Back"
  >
    ←
  </button>

  <div class="journey-header-controls">

    <button
      class="journey-control"
      type="button"
      data-theme-toggle
      aria-label="Toggle Theme"
    >
      ◐
    </button>

    <button
      class="journey-control"
      type="button"
      data-language-toggle
      aria-label="Toggle Language"
    >
      ES
    </button>

  </div>

</header>
"""

for filename in FILES:

    path = Path(filename)

    if not path.exists():
        print(f"Missing: {filename}")
        continue

    html = path.read_text(encoding="utf-8")

    # Remove shared navigation
    start = html.find('<div\n    id="navigation"')
    if start != -1:
        end = html.find("</div>", start)
        if end != -1:
            html = html[:start] + NEW_HEADER + html[end + 6:]

    # Remove hero divider
    start = html.find('<div\n    class="site-hero-divider"')
    if start != -1:
        end = html.find("</div>", start)
        if end != -1:
            html = html[:start] + html[end + 6:]

    # Remove bottom journey-back section
    start = html.find('<div class="journey-back">')
    if start != -1:
        end = html.find("</div>", start)
        if end != -1:
            html = html[:start] + html[end + 6:]

    path.write_text(html, encoding="utf-8")

    print(f"Updated {filename}")

print("\nDone.")
