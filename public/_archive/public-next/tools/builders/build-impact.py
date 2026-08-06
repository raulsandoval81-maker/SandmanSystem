#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Impact page.

Run:

    python3 public-next/tools/builders/build-impact.py

Creates:

    public-next/impact.html
    public-next/assets/css/impact.css

Expected images:

    assets/images/hero/hero-impact-en.png
    assets/images/hero/hero-impact-es.png
    assets/images/sections/impact-family.png
    assets/images/sections/impact-community.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC = ROOT / "public-next"

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Impact | Sandman Combat™</title>
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/impact.css">
</head>
<body>
<header class="hero">
<h1>Built for More Than Competition</h1>
<p>Sandman measures success by stronger athletes, stronger families, and stronger communities.</p>
</header>

<main class="wrap">

<section class="card">
<h2>For Athletes</h2>
<ul>
<li>Confidence through earned progress</li>
<li>Discipline through consistent training</li>
<li>Leadership through responsibility</li>
<li>Resilience through challenge</li>
</ul>
</section>

<section class="card">
<h2>For Families</h2>
<p>Parents gain a structured environment with clear expectations, coach accountability, and visible growth.</p>
</section>

<section class="card">
<h2>For Communities</h2>
<p>Healthy young people become leaders, mentors, teammates, and future coaches.</p>
</section>

<section class="quote">
<h2>Heroes Build Heroes.</h2>
<p>Combat is the classroom. Character is the curriculum.</p>
<a class="button" href="connect.html">Connect With Sandman</a>
</section>

</main>
</body>
</html>
"""

CSS = """
.hero{
padding:8rem 2rem;
text-align:center;
background:#111;
color:#fff;
}
.hero h1{font-size:clamp(3rem,7vw,6rem);}
.wrap{
max-width:1200px;
margin:auto;
padding:4rem 1.5rem;
display:grid;
gap:2rem;
}
.card,.quote{
padding:2rem;
border:1px solid rgba(255,255,255,.12);
border-radius:20px;
background:#161616;
}
.quote{
text-align:center;
}
.button{
display:inline-block;
margin-top:1rem;
padding:.9rem 1.4rem;
border-radius:999px;
text-decoration:none;
}
"""

(PUBLIC/"assets/css").mkdir(parents=True, exist_ok=True)
(PUBLIC/"impact.html").write_text(HTML, encoding="utf-8")
(PUBLIC/"assets/css/impact.css").write_text(CSS, encoding="utf-8")

print("✅ Wrote public-next/impact.html")
print("✅ Wrote public-next/assets/css/impact.css")
print()
print("Impact page build complete.")
