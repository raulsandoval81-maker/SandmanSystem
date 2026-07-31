#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Library page.

Run:

    python3 public-next/tools/builders/build-library.py

Creates:

    public-next/library.html
    public-next/assets/css/library.css

Expected images:

    assets/images/hero/hero-library-en.png
    assets/images/hero/hero-library-es.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC = ROOT / "public-next"

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Library | Sandman Combat™</title>
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/library.css">
</head>
<body>

<header class="hero">
<h1>Knowledge Builds Champions.</h1>
<p>Explore the growing Sandman library of articles, guides, doctrine, and resources for athletes and families.</p>
</header>

<main class="wrap">

<section class="grid">

<article class="card">
<h2>For Athletes</h2>
<p>Training guides, nutrition, recovery, mindset, competition preparation, and progression resources.</p>
</article>

<article class="card">
<h2>For Parents</h2>
<p>How to support young athletes, competition expectations, communication, and long-term development.</p>
</article>

<article class="card">
<h2>For Coaches</h2>
<p>Coaching philosophy, lesson structure, leadership, and athlete development doctrine.</p>
</article>

<article class="card">
<h2>Coming Soon</h2>
<ul>
<li>Articles</li>
<li>Videos</li>
<li>Downloads</li>
<li>Lesson Library</li>
<li>Strength Library</li>
<li>Honor Library</li>
</ul>
</article>

</section>

<section class="quote">
<h2>Never Stop Learning.</h2>
<p>The best athletes stay students.</p>
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
.hero h1{
font-size:clamp(3rem,7vw,6rem);
}
.wrap{
max-width:1200px;
margin:auto;
padding:4rem 1.5rem;
}
.grid{
display:grid;
grid-template-columns:repeat(auto-fit,minmax(260px,1fr));
gap:2rem;
}
.card,.quote{
padding:2rem;
border:1px solid rgba(255,255,255,.12);
border-radius:20px;
background:#161616;
}
.quote{
margin-top:3rem;
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
(PUBLIC/"library.html").write_text(HTML, encoding="utf-8")
(PUBLIC/"assets/css/library.css").write_text(CSS, encoding="utf-8")

print("✅ Wrote public-next/library.html")
print("✅ Wrote public-next/assets/css/library.css")
print()
print("Library page build complete.")
