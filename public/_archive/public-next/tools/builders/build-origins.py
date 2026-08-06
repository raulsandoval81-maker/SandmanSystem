#!/usr/bin/env python3
"""
Build the Sandman Combat public-next Origins page.

Run:

    python3 public-next/tools/builders/build-origins.py

Creates:

    public-next/origins.html
    public-next/assets/css/origins.css

Expected images:

    assets/images/hero/hero-origins-en.png
    assets/images/hero/hero-origins-es.png
    assets/images/sections/origins-timeline.png
    assets/images/sections/origins-coach.png
"""

from pathlib import Path

ROOT = Path.cwd()
PUBLIC = ROOT / "public-next"

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Origins | Sandman Combat™</title>
<link rel="stylesheet" href="assets/css/site.css">
<link rel="stylesheet" href="assets/css/origins.css">
</head>
<body>

<header class="hero">
<h1>The Story Behind the System.</h1>
<p>Sandman was not created overnight. It was forged through years of coaching, observation, refinement, and a commitment to helping athletes become better people.</p>
</header>

<main class="wrap">

<section class="split">
<div>
<h2>The Beginning</h2>
<p>Sandman began with a simple belief: competition can teach far more than technique when it is guided by purpose.</p>
<p>Every practice, tournament, victory, setback, and conversation became another lesson in building people—not just athletes.</p>
</div>
<div class="image">
<img src="assets/images/sections/origins-coach.png" alt="Coach developing athletes">
</div>
</section>

<section class="timeline">
<h2>How the System Evolved</h2>

<div class="step">
<h3>Observe</h3>
<p>Years of coaching revealed consistent patterns in growth, confidence, leadership, and resilience.</p>
</div>

<div class="step">
<h3>Refine</h3>
<p>Training methods, progression standards, and coaching philosophy were continuously improved.</p>
</div>

<div class="step">
<h3>Build</h3>
<p>The Sandman System united Combat, Strength, Honor, and Conditioning into one long-term development model.</p>
</div>

<div class="step">
<h3>Share</h3>
<p>The goal became bigger than one team—creating a system that could serve athletes, families, coaches, and communities.</p>
</div>

</section>

<section class="mission">
<h2>Why Sandman Exists</h2>

<ul>
<li>Develop confident athletes.</li>
<li>Strengthen families.</li>
<li>Build leaders through earned responsibility.</li>
<li>Create healthier communities.</li>
<li>Leave every athlete better than we found them.</li>
</ul>

</section>

<section class="quote">
<h2>Heroes Build Heroes.</h2>
<p>The journey is never about collecting titles. It is about becoming the kind of person worthy of them.</p>

<a class="button" href="connect.html">Begin Your Journey</a>

</section>

</main>

</body>
</html>
"""

CSS = """
.hero{
padding:8rem 2rem;
background:#111;
color:#fff;
text-align:center;
}
.hero h1{
font-size:clamp(3rem,7vw,6rem);
}
.wrap{
max-width:1200px;
margin:auto;
padding:4rem 1.5rem;
display:grid;
gap:3rem;
}
.split{
display:grid;
grid-template-columns:1.1fr .9fr;
gap:3rem;
align-items:center;
}
.image img{
width:100%;
border-radius:20px;
display:block;
}
.timeline{
display:grid;
gap:1rem;
}
.step,.mission,.quote{
padding:2rem;
background:#161616;
border:1px solid rgba(255,255,255,.12);
border-radius:20px;
}
.quote{
text-align:center;
}
.button{
display:inline-block;
margin-top:1rem;
padding:.9rem 1.5rem;
border-radius:999px;
text-decoration:none;
}
@media(max-width:900px){
.split{grid-template-columns:1fr;}
}
"""

(PUBLIC/"assets/css").mkdir(parents=True, exist_ok=True)
(PUBLIC/"origins.html").write_text(HTML,encoding="utf-8")
(PUBLIC/"assets/css/origins.css").write_text(CSS,encoding="utf-8")

print("✅ Wrote public-next/origins.html")
print("✅ Wrote public-next/assets/css/origins.css")
print()
print("Origins page build complete.")
