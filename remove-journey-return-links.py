from pathlib import Path
import re

FILES = [
    Path("public/marketing/foundry8-z2h/index.html"),
    Path("public/marketing/foundry4-p2l/index.html"),
    Path("public/marketing/foundry4-q2m/index.html"),
]

for path in FILES:
    if not path.exists():
        print(f"Missing: {path}")
        continue

    html = path.read_text(encoding="utf-8")

    # Remove any button using history.back()
    html = re.sub(
        r'<button\b[^>]*onclick=["\']history\.back\(\)["\'][^>]*>.*?</button>',
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Remove any journey-back block
    html = re.sub(
        r'<div\b[^>]*class=["\'][^"\']*\bjourney-back\b[^"\']*["\'][^>]*>.*?</div>',
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # Remove direct links back to journeys.html
    html = re.sub(
        r'<a\b[^>]*href=["\']/journeys\.html["\'][^>]*>.*?</a>',
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    path.write_text(html, encoding="utf-8")
    print(f"Updated: {path}")

print("Done."
