from pathlib import Path

FILES = [
    Path("public/marketing/foundry8-z2h/index.html"),
    Path("public/marketing/foundry4-p2l/index.html"),
    Path("public/marketing/foundry4-q2m/index.html"),
]

HEADER_HTML = """
<header class="journey-minimal-header">

  <button
    class="journey-header-control"
    type="button"
    data-theme-toggle
    aria-label="Toggle theme"
  >
    ◐
  </button>

  <div class="journey-header-title">
    Sandman Academy of Combat &amp; Fitness
  </div>

  <button
    class="journey-header-control"
    type="button"
    data-language-toggle
    aria-label="Toggle language"
  >
    ES
  </button>

</header>
"""

HEADER_CSS = """
    /* =========================================
       MINIMAL JOURNEY HEADER
    ========================================= */

    .journey-minimal-header{
      display:grid;
      grid-template-columns:52px minmax(0,1fr) 52px;
      align-items:center;
      gap:12px;

      width:100%;
      min-height:82px;

      margin:0;
      padding:12px 18px;

      background:var(--panel, #111113);
      border-bottom:1px solid rgba(212,175,55,.45);
    }

    .journey-header-title{
      text-align:center;

      color:var(--heading, #fff);

      font-size:clamp(.9rem, 2.5vw, 1.15rem);
      font-weight:900;
      letter-spacing:.06em;
      line-height:1.15;
      text-transform:uppercase;
    }

    .journey-header-control{
      display:inline-flex;
      align-items:center;
      justify-content:center;

      width:48px;
      height:48px;

      margin:0;
      padding:0;

      color:var(--heading-accent, #d4af37);
      background:transparent;

      border:1px solid rgba(212,175,55,.55);
      border-radius:50%;

      font:inherit;
      font-size:.9rem;
      font-weight:900;

      cursor:pointer;
    }

    .journey-header-control:hover,
    .journey-header-control:focus-visible{
      background:rgba(212,175,55,.08);
      outline:none;
    }

    @media (max-width:520px){

      .journey-minimal-header{
        grid-template-columns:48px minmax(0,1fr) 48px;
        gap:8px;
        min-height:76px;
        padding:10px 12px;
      }

      .journey-header-control{
        width:44px;
        height:44px;
      }

      .journey-header-title{
        font-size:.82rem;
        letter-spacing:.04em;
      }

    }
"""

for path in FILES:

    if not path.exists():
        print(f"❌ Missing: {path}")
        continue

    html = path.read_text(encoding="utf-8")

    # Replace any existing minimal header.
    start = html.find('<header class="journey-minimal-header">')

    if start != -1:
        end = html.find("</header>", start)

        if end != -1:
            end += len("</header>")
            html = html[:start] + HEADER_HTML + html[end:]
    else:
        body_start = html.find("<body>")

        if body_start == -1:
            print(f"❌ No <body> found: {path}")
            continue

        insert_at = body_start + len("<body>")
        html = html[:insert_at] + "\n" + HEADER_HTML + html[insert_at:]

    # Add header CSS before the final </style>.
    if ".journey-header-title{" not in html:

        style_end = html.rfind("</style>")

        if style_end != -1:
            html = html[:style_end] + HEADER_CSS + "\n  " + html[style_end:]
        else:
            print(f"⚠️ No </style> found in: {path}")

    path.write_text(html, encoding="utf-8")

    print(f"✅ Updated: {path}")

print("\nDone.")
