#!/usr/bin/env python3

from pathlib import Path
import shutil
import re

# CHANGE THIS PATH
ABOUT_FILE = Path("public/about.html")

if not ABOUT_FILE.exists():
    print(f"❌ File not found: {ABOUT_FILE}")
    exit(1)

backup = ABOUT_FILE.with_suffix(".html.before-polish")
shutil.copy2(ABOUT_FILE, backup)
print(f"✅ Backup created: {backup}")

text = ABOUT_FILE.read_text(encoding="utf-8")

# Remove trailing spaces
text = re.sub(r"[ \t]+$", "", text, flags=re.MULTILINE)

# Collapse 3+ blank lines into 2
text = re.sub(r"\n{3,}", "\n\n", text)

# Optional typography cleanup
text = text.replace("...", "…")

ABOUT_FILE.write_text(text, encoding="utf-8")

print("✅ About page polished successfully.")
