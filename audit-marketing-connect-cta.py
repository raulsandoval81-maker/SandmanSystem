from pathlib import Path

ALLOWED_ROOTS = [
    Path("public/marketing/fitness"),
    Path("public/marketing/foundry8-z2h"),
    Path("public/marketing/foundry4-p2l"),
    Path("public/marketing/foundry4-q2m"),
]

MARKER = "marketing-connect-cta"

found = []

for path in Path("public").rglob("*.html"):
    text = path.read_text(encoding="utf-8", errors="ignore")

    if MARKER in text:
        found.append(path)

print("\nPages containing the marketing CTA:\n")

for path in sorted(found):
    print(path)

outside_allowed = [
    path
    for path in found
    if not any(root in path.parents for root in ALLOWED_ROOTS)
]

print()

if outside_allowed:
    print("❌ CTA found outside approved marketing folders:")

    for path in outside_allowed:
        print(path)
else:
    print("✅ All marketing CTAs are inside approved marketing folders only.")
