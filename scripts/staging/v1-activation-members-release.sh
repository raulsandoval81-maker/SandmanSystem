#!/usr/bin/env bash
set -Eeuo pipefail
trap 'printf "Staging release stopped at line %s (exit %s).\n" "$LINENO" "$?" >&2' ERR

project=sandman-combat-staging
region=us-central1
trigger=recordEnrollmentAthleteActivated
members=searchManagementMembers
release_label=v1-activation-members
test "$GITHUB_REPOSITORY" = raulsandoval81-maker/SandmanSystem
test "$GITHUB_REF" = refs/heads/main
test "$GITHUB_WORKFLOW_REF" = 'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main'
test "$CONFIRM_PROJECT" = "$project"
test "$APPROVAL" = APPROVE_V1_STAGING_ACTIVATION_AND_MEMBERS
test "$TRANSPORT_APPROVAL" = APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"

temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
mkdir -p "$temp/source" "$temp/rollback"
export NODE_PATH="$PWD/functions/node_modules"
node scripts/staging/recover-v1-activation-history.cjs --check

describe() {
  gcloud functions describe "$1" --gen2 --project="$project" --region="$region" --format=json
}

describe "$trigger" > "$temp/trigger-before.json"
# Cloud Functions v2 returns an array of attribute/value/operator filters.
jq -c '{state, eventType: .eventTrigger.eventType, documentFilters:
  [.eventTrigger.eventFilters[]? | objects | select(.attribute == "document") |
    {attribute, value, operator}]}' "$temp/trigger-before.json"
if ! jq -e '.state == "ACTIVE" and .eventTrigger.eventType == "google.cloud.firestore.document.v1.updated" and
  ([.eventTrigger.eventFilters[]? | objects | select(.attribute == "document")] |
    length == 1 and .[0].value == "intakes/{intakeId}" and .[0].operator == "match-path-pattern")' \
  "$temp/trigger-before.json" >/dev/null; then
  echo 'Activation trigger is not ACTIVE with the exact Intake update path pattern.' >&2
  exit 1
fi
old_revision="$(jq -er '.serviceConfig.revision | split("/") | last' "$temp/trigger-before.json")"
old_source="$(jq -er '.buildConfig.source.storageSource | "gs://\(.bucket)/\(.object)#\(.generation)"' "$temp/trigger-before.json")"
gcloud storage cp "$old_source" "$temp/rollback/activation-trigger.zip" --project="$project"
sha256sum "$temp/rollback/activation-trigger.zip"
echo "Captured rollback source: $old_source ($old_revision)"

rsync -a --exclude=node_modules/ --exclude='.env*' --exclude='.git*' functions/ "$temp/source/"
node - "$temp/source" <<'NODE'
const fs = require('node:fs');
const dir = process.argv[2];
const packagePath = dir + '/package.json';
fs.writeFileSync(dir + '/sandman-release-sha.txt', process.env.GITHUB_SHA + '\n');
const pkg = JSON.parse(fs.readFileSync(packagePath));
pkg.main = 'index.cjs';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2));
fs.writeFileSync(dir + '/index.cjs', `
const { initializeApp } = require('firebase-admin/app');
initializeApp();
exports.recordEnrollmentAthleteActivated = require('./lib/enrollment/enrollmentActivity').recordEnrollmentAthleteActivated;
exports.searchManagementMembers = require('./lib/access/searchManagementMembers').searchManagementMembers;
`);
NODE

if describe "$members" > "$temp/members.json" 2>"$temp/members-error"; then
  jq -e --arg sha "$GITHUB_SHA" --arg release "$release_label" '
    .state == "ACTIVE" and .buildConfig.entryPoint == "searchManagementMembers" and
    .labels["sandman-enrollment-release"] == $release and .labels["sandman-source-sha"] == $sha' \
    "$temp/members.json" >/dev/null
  members_missing=false
else
  if ! grep -Eiq 'NOT_FOUND|not found|404|does not exist' "$temp/members-error"; then
    echo 'Members function lookup failed without proving absence.' >&2
    if grep -Eiq 'PERMISSION_DENIED|permission|403' "$temp/members-error"; then
      echo 'Members function lookup was denied by Google Cloud.' >&2
    fi
    exit 1
  fi
  echo 'Members function absence verified.'
  members_missing=true
fi

case "$old_revision" in
  recordenrollmentathleteactivated-00001-saz)
    expected_source="gs://gcf-v2-sources-991554514268-us-central1/recordEnrollmentAthleteActivated/function-source.zip#1793763285373279"
    expected_sha256="603b32d6af0349a8df37092291d8cedf1cff39d87fe9445c524c3a697c6f0a0d"
    if [[ "$old_source" != "$expected_source" ]] ||
       ! printf '%s  %s\n' "$expected_sha256" "$temp/rollback/activation-trigger.zip" | sha256sum --check --status; then
      echo 'Activation rollback generation or SHA-256 differs from the reviewed baseline.' >&2
      exit 1
    fi
    echo 'Verified exact activation trigger rollback generation and SHA-256.'
    (cd "$temp/source" && zip -qr "$temp/trigger-source.zip" .)
    python3 - "$temp/trigger-source.zip" <<'PY'
import importlib.util
import subprocess
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location("staging_source_update", "scripts/staging/pr606-cash-check-deploy.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
name = "recordEnrollmentAthleteActivated"
release.FUNCTIONS[name] = 2
token = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()
release.source_update(name, Path(sys.argv[1]).read_bytes(), token)
PY
    ;;
  *)
    deployed_sha="$(unzip -p "$temp/rollback/activation-trigger.zip" sandman-release-sha.txt || true)"
    if test "$deployed_sha" != "$GITHUB_SHA"; then
      echo "Unexpected trigger revision $old_revision. Inspect before retrying." >&2
      exit 1
    fi
    echo "Trigger already carries this exact release source."
    ;;
esac

describe "$trigger" > "$temp/trigger-after.json"
diff -u <(jq -S '.eventTrigger' "$temp/trigger-before.json") <(jq -S '.eventTrigger' "$temp/trigger-after.json")
jq -e '.state == "ACTIVE"' "$temp/trigger-after.json"
if test "$old_revision" = recordenrollmentathleteactivated-00001-saz; then
  jq -e --arg old "$old_revision" '.serviceConfig.revision != $old' "$temp/trigger-after.json"
fi
jq -r '.serviceConfig.revision' "$temp/trigger-after.json"

if "$members_missing"; then
  gcloud functions deploy "$members" --gen2 --project="$project" --region="$region" \
    --runtime=nodejs22 --entry-point="$members" --source="$temp/source" \
    --run-service-account="sandman-billing-runtime@$project.iam.gserviceaccount.com" \
    --build-service-account="projects/$project/serviceAccounts/sandman-practice-build@$project.iam.gserviceaccount.com" \
    --cpu=1 --memory=256Mi --timeout=60s --max-instances=20 --concurrency=80 \
    --ingress-settings=all --update-labels="sandman-enrollment-release=$release_label,sandman-source-sha=$GITHUB_SHA" \
    --trigger-http --no-allow-unauthenticated --quiet
fi
gcloud run services update searchmanagementmembers --project="$project" --region="$region" --no-invoker-iam-check --quiet
describe "$members" | jq -er 'select(.state == "ACTIVE") | .serviceConfig.revision'
status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS \
  -H 'Origin: https://sandman-combat-staging.web.app' -H 'Access-Control-Request-Method: POST' \
  "https://$region-$project.cloudfunctions.net/$members")"
test "$status" = 204
status="$(curl -sS -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"data":{"search":"F8_0002"}}' "https://$region-$project.cloudfunctions.net/$members")"
test "$status" = 401

node scripts/staging/recover-v1-activation-history.cjs --apply
node scripts/staging/recover-v1-activation-history.cjs --check | grep -Fx 'already verified'
