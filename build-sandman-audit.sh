#!/bin/bash

OUT="sandman-system-audit.txt"

{
  echo "========================================"
  echo "SANDMAN SYSTEM — REPOSITORY AUDIT"
  echo "Generated: $(date)"
  echo "========================================"

  echo
  echo "=== LOCATION ==="
  pwd

  echo
  echo "=== GIT STATUS ==="
  git status

  echo
  echo "=== RECENT COMMITS ==="
  git log -15 --oneline --decorate

  echo
  echo "=== ROOT FILES ==="
  find . -maxdepth 1 -type f \
    ! -name ".env*" \
    | sort

  echo
  echo "=== TOP-LEVEL DIRECTORIES ==="
  find . -maxdepth 2 -type d \
    ! -path "./.git*" \
    ! -path "./node_modules*" \
    ! -path "./functions/node_modules*" \
    | sort

  echo
  echo "=== PUBLIC APPLICATION FILES ==="
  find public -maxdepth 4 -type f 2>/dev/null \
    ! -name "*.map" \
    ! -name "*.png" \
    ! -name "*.jpg" \
    ! -name "*.jpeg" \
    ! -name "*.webp" \
    ! -name "*.gif" \
    ! -name "*.svg" \
    | sort

  echo
  echo "=== CLOUD FUNCTIONS ==="
  find functions -maxdepth 5 -type f 2>/dev/null \
    ! -path "*/node_modules/*" \
    ! -path "*/lib/*" \
    ! -name "*.map" \
    ! -name ".env*" \
    | sort

  echo
  echo "=== FUNCTION EXPORTS ==="
  find functions -type f \( -name "*.ts" -o -name "*.js" \) \
    ! -path "*/node_modules/*" \
    ! -path "*/lib/*" \
    -print0 2>/dev/null \
    | xargs -0 grep -Hn "^export " 2>/dev/null

  echo
  echo "=== FIREBASE CONFIGURATION ==="
  for file in firebase.json firestore.rules firestore.indexes.json storage.rules; do
    if [ -f "$file" ]; then
      echo
      echo "--- $file ---"
      cat "$file"
    fi
  done

  echo
  echo "=== PACKAGE MANIFESTS ==="
  for file in package.json functions/package.json; do
    if [ -f "$file" ]; then
      echo
      echo "--- $file ---"
      cat "$file"
    fi
  done

  echo
  echo "=== STRIPE / BILLING REFERENCES ==="
  grep -RniE \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=lib \
    --exclude="*.map" \
    --exclude=".env*" \
    "stripe|checkout|subscription|membership|billing|invoice|payment|customer portal|webhook" \
    public functions 2>/dev/null

  echo
  echo "=== FIRESTORE WRITES ==="
  grep -RniE \
    --include="*.js" \
    --include="*.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=lib \
    "setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction" \
    public functions/src 2>/dev/null

  echo
  echo "=== TODO / FIXME / TEMPORARY MARKERS ==="
  grep -RniE \
    --include="*.html" \
    --include="*.css" \
    --include="*.js" \
    --include="*.ts" \
    --include="*.json" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=lib \
    "TODO|FIXME|HACK|TEMP|PLACEHOLDER|COMING SOON|NOT IMPLEMENTED" \
    public functions docs 2>/dev/null

  echo
  echo "=== DUPLICATE / BACKUP FILES ==="
  find public functions docs -type f 2>/dev/null \
    | grep -Ei "\.before-|\.backup|\.bak$|\.save$| copy|old|archive"

} > "$OUT"

echo
echo "Audit created:"
echo "$OUT"
wc -l "$OUT"
