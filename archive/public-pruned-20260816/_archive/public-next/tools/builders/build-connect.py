#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Connect page.

Run:

    python3 public-next/tools/builders/build-connect.py

Creates:

    public-next/connect.html
    public-next/assets/css/connect.css

Expected images:
    assets/images/hero/hero-connect-en.png
    assets/images/hero/hero-connect-es.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC = ROOT / "public-next"

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect | Sandman Combat™</title>
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/connect.css">
</head>
<body>

<header class="hero">
<h1>Start Your Journey.</h1>
<p>Every athlete begins with a conversation. We'd love to meet your family, answer questions, and help you find the right program.</p>
</header>

<main class="wrap">

<section class="grid">

<article class="card">
<h2>1. Connect</h2>
<p>Tell us about your athlete and your goals.</p>
</article>

<article class="card">
<h2>2. Visit</h2>
<p>Meet a coach, tour the academy, and observe training.</p>
</article>

<article class="card">
<h2>3. Begin</h2>
<p>Start training and begin earning your journey.</p>
</article>

</section>

<section class="panel">
<h2>Questions?</h2>
<p>We're happy to help with age groups, schedules, locations, and program recommendations.</p>

<div class="actions">
<a class="button" href="mailto:info@sandmancombat.com">Email Us</a>
<a class="button secondary" href="index.html">Return Home</a>
</div>
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
max-width:1100px;
margin:auto;
padding:4rem 1.5rem;
}
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
gap:2rem;
}
.card,.panel{
background:#161616;
border:1px solid rgba(255,255,255,.12);
border-radius:20px;
padding:2rem;
}
.panel{
margin-top:3rem;
text-align:center;
}
.actions{
display:flex;
justify-content:center;
gap:1rem;
flex-wrap:wrap;
margin-top:1.5rem;
}
.button{
padding:.9rem 1.5rem;
border-radius:999px;
text-decoration:none;
}
.secondary{
opacity:.8;
}
"""

(PUBLIC/"assets/css").mkdir(parents=True, exist_ok=True)
(PUBLIC/"connect.html").write_text(HTML,encoding="utf-8")
(PUBLIC/"assets/css/connect.css").write_text(CSS,encoding="utf-8")

print("✅ Wrote public-next/connect.html")
print("✅ Wrote public-next/assets/css/connect.css")
print()
print("Connect page build complete.")
