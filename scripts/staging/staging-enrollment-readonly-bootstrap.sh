#!/usr/bin/env bash
set -euo pipefail
test "$GITHUB_REPOSITORY" = 'raulsandoval81-maker/SandmanSystem'
test "$GITHUB_REF" = refs/heads/main
test "$CONFIRM_PROJECT" = sandman-combat-staging
test "$(git -C application rev-parse HEAD)" = d0f6db3b5199616d066d07a58e984dbdac7d576f
npm ci --prefix application/functions --ignore-scripts --no-audit --no-fund
npm run build --prefix application/functions
mkdir -p release-source
rsync -a --exclude=node_modules/ --exclude=.env --exclude='.env.*' application/functions/ release-source/
node - <<'NODE'
const fs=require('fs');
const p='release-source/package.json',v=JSON.parse(fs.readFileSync(p));v.main='index.cjs';fs.writeFileSync(p,JSON.stringify(v,null,2));
fs.writeFileSync('release-source/index.cjs',"const {getApps,initializeApp}=require('firebase-admin/app');if(!getApps().some(a=>a.name==='[DEFAULT]')) initializeApp();module.exports={getEnrollmentPlacementActivity:require('./lib/enrollment/enrollmentActivity').getEnrollmentPlacementActivity,getAccessSetupStatus:require('./lib/access/getAccessSetupStatus').getAccessSetupStatus};\n");
NODE
if find release-source -type f \( -name .env -o -name '.env.*' \) -print -quit | grep -q .; then exit 1; fi
NODE_PATH="$PWD/application/functions/node_modules" node - <<'NODE'
const a=require('./release-source/index.cjs'),assert=require('assert/strict');
assert.deepEqual(Object.keys(a).sort(),['getAccessSetupStatus','getEnrollmentPlacementActivity']);
for(const f of Object.values(a)){assert.ok(f.__endpoint.callableTrigger);assert.ok(!f.__endpoint.httpsTrigger)}
NODE
test "$ACTION" = validate && { echo 'PASS: offline only'; exit 0; }
test "$ACTION" = bootstrap
test "$GITHUB_WORKFLOW_REF" = 'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-enrollment-readonly-bootstrap.yml@refs/heads/main'
test "$APPROVE_FUNCTIONS" = APPROVE_TWO_STAGING_ENROLLMENT_READONLY_CALLABLES
test "$APPROVE_TRANSPORT" = APPROVE_STAGING_APPLICATION_AUTH_TRANSPORT
mkdir -p evidence
gcloud functions list --regions=us-central1 --project=sandman-combat-staging --format=json > evidence/before.json
for fn in getEnrollmentPlacementActivity getAccessSetupStatus; do
  if gcloud functions describe "$fn" --gen2 --region=us-central1 --project=sandman-combat-staging --format=json > /tmp/exists.json 2>/tmp/lookup.err; then echo "Refusing overwrite: $fn"; exit 1; fi
  grep -Eiq 'NOT_FOUND|not found|404|does not exist' /tmp/lookup.err || { echo 'Lookup not proven absent'; exit 1; }
done
for fn in getEnrollmentPlacementActivity getAccessSetupStatus; do
  gcloud functions deploy "$fn" --gen2 --project=sandman-combat-staging --region=us-central1 --runtime=nodejs22 --entry-point="$fn" --source=release-source --run-service-account=sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com --build-service-account=projects/sandman-combat-staging/serviceAccounts/sandman-practice-build@sandman-combat-staging.iam.gserviceaccount.com --cpu=1 --memory=256Mi --timeout=60s --max-instances=20 --concurrency=80 --ingress-settings=all --clear-secrets --trigger-http --no-allow-unauthenticated --quiet
  service="$(printf '%s' "$fn" | tr '[:upper:]' '[:lower:]')"
  gcloud run services update "$service" --project=sandman-combat-staging --region=us-central1 --no-invoker-iam-check --quiet
  gcloud functions describe "$fn" --gen2 --region=us-central1 --project=sandman-combat-staging --format=json > "evidence/$fn.json"
  gcloud run services describe "$service" --region=us-central1 --project=sandman-combat-staging --format=json > "evidence/$fn-run.json"
  jq -e --arg fn "$fn" '.state=="ACTIVE" and .environment=="GEN_2" and .buildConfig.entryPoint==$fn and .buildConfig.runtime=="nodejs22" and ((.serviceConfig.secretEnvironmentVariables//[])|length)==0' "evidence/$fn.json"
  jq -e '.status.latestReadyRevisionName != null and .metadata.annotations["run.googleapis.com/invoker-iam-disabled"] == "true"' "evidence/$fn-run.json"
done
gcloud functions list --regions=us-central1 --project=sandman-combat-staging --format=json > evidence/after.json
node - <<'NODE'
const fs=require('fs'),assert=require('assert/strict');const targets=['getEnrollmentPlacementActivity','getAccessSetupStatus'];
const norm=p=>JSON.parse(fs.readFileSync(p)).filter(x=>!targets.some(t=>x.name.endsWith('/'+t))).map(x=>x.name).sort();
assert.deepEqual(norm('evidence/before.json'),norm('evidence/after.json'));
NODE
for fn in getEnrollmentPlacementActivity getAccessSetupStatus; do
  code="$(curl -sS -o /dev/null -D /tmp/cors.headers -w '%{http_code}' -X OPTIONS -H 'Origin: https://sandman-combat-staging.web.app' -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type' "https://us-central1-sandman-combat-staging.cloudfunctions.net/$fn")"
  test "$code" = 204
  grep -iq '^access-control-allow-origin:' /tmp/cors.headers
done
echo 'Two callables deployed; authenticated synthetic P-000002 reads remain a separate verification gate.'
