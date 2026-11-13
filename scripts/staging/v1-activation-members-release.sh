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

# Continue only the exact deployment completed by run 43378051277.
deployed_sha=da90ad105f7325d5edfa72bea50f1a04502d2d23
trigger_revision=recordenrollmentathleteactivated-00002-xaz
members_revision=searchmanagementmembers-00002-jtw
rollback_source="gs://gcf-v2-sources-991554514268-us-central1/recordEnrollmentAthleteActivated/function-source.zip#1793763285373279"
rollback_sha256=603b32d6af0349a8df37092291d8cedf1cff39d87fe9445c524c3a697c6f0a0d

temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT
export NODE_PATH="$PWD/functions/node_modules"
node scripts/staging/recover-v1-activation-history.cjs --check

describe() {
  gcloud functions describe "$1" --gen2 --project="$project" --region="$region" --format=json
}

describe "$trigger" > "$temp/trigger.json"
jq -e --arg rev "$trigger_revision" '
  .state == "ACTIVE" and .environment == "GEN_2" and
  .buildConfig.entryPoint == "recordEnrollmentAthleteActivated" and
  .buildConfig.runtime == "nodejs22" and
  .serviceConfig.revision == $rev and .serviceConfig.allTrafficOnLatestRevision == true and
  .serviceConfig.serviceAccountEmail == "991554514268-compute@developer.gserviceaccount.com" and
  .eventTrigger.eventType == "google.cloud.firestore.document.v1.updated" and
  ([.eventTrigger.eventFilters[] | select(.attribute == "document")] |
    length == 1 and .[0].value == "intakes/{intakeId}" and .[0].operator == "match-path-pattern")
' "$temp/trigger.json" >/dev/null
describe "$members" > "$temp/members.json"
jq -c '{state, environment, entryPoint: .buildConfig.entryPoint, runtime: .buildConfig.runtime,
  sourceGeneration: .buildConfig.sourceProvenance.resolvedStorageSource.generation,
  revision: .serviceConfig.revision, runtimeAccount: .serviceConfig.serviceAccountEmail,
  release: .labels["sandman-enrollment-release"], sourceSha: .labels["sandman-source-sha"]}' "$temp/members.json"
jq -e --arg sha "$deployed_sha" --arg release "$release_label" '
  .state == "ACTIVE" and .environment == "GEN_2" and
  .buildConfig.entryPoint == "searchManagementMembers" and .buildConfig.runtime == "nodejs22" and
  (.buildConfig.sourceProvenance.resolvedStorageSource.generation | tostring) == "1794551034782213" and
  (.serviceConfig.revision | if . == null then true else
    (type == "string" and (split("/") | last | . == "searchmanagementmembers-00001-doh" or . == "searchmanagementmembers-00002-jtw")) end) and
  .serviceConfig.serviceAccountEmail == "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com" and
  .labels["sandman-enrollment-release"] == $release and .labels["sandman-source-sha"] == $sha
' "$temp/members.json" >/dev/null
gcloud run services describe searchmanagementmembers --project="$project" --region="$region" --format=json > "$temp/members-run.json"
jq -e --arg rev "$members_revision" '
  .metadata.annotations["run.googleapis.com/invoker-iam-disabled"] == "true" and
  .status.latestReadyRevisionName == $rev and
  ([.status.traffic[] | select((.percent // 0) > 0)] |
    length == 1 and .[0].revisionName == $rev and .[0].percent == 100)
' "$temp/members-run.json" >/dev/null
gcloud run revisions describe "$members_revision" --project="$project" --region="$region" --format=json > "$temp/members-revision.json"
jq -e '
  .spec.serviceAccountName == "sandman-billing-runtime@sandman-combat-staging.iam.gserviceaccount.com" and
  (.status.imageDigest | split("@") | last) == "sha256:041490769997e5cd3dba74cd70a3de6ff9aba37aff95776f74b0d96d145584d2"
' "$temp/members-revision.json" >/dev/null
printf 'Verified existing revisions: %s, %s\n' "$trigger_revision" "$members_revision"

gcloud storage cp "$rollback_source" "$temp/activation-trigger.zip" --project="$project"
printf '%s  %s\n' "$rollback_sha256" "$temp/activation-trigger.zip" | sha256sum --check
printf 'Verified rollback source %s SHA-256 %s\n' "$rollback_source" "$rollback_sha256"

url="https://$region-$project.cloudfunctions.net/$members"
status="$(curl -sS -o /dev/null -w '%{http_code}' -X OPTIONS \
  -H 'Origin: https://sandman-combat-staging.web.app' -H 'Access-Control-Request-Method: POST' "$url")"
if test "$status" != 204; then
  echo "Members transport preflight returned HTTP $status. An authorized administrator must configure staging callable transport." >&2
  exit 1
fi
status="$(curl -sS -o "$temp/unauthenticated.json" -w '%{http_code}' -H 'Content-Type: application/json' \
  -d '{"data":{"search":"F8_0002"}}' "$url")"
test "$status" = 401
jq -e '.error.status == "UNAUTHENTICATED"' "$temp/unauthenticated.json" >/dev/null
echo 'Members transport and Firebase unauthenticated rejection verified.'

node scripts/staging/recover-v1-activation-history.cjs --apply
node scripts/staging/recover-v1-activation-history.cjs --check | grep -Fx 'already verified'
