# Strength & Honor Vault boundary proof

This isolated development harness reads the existing Vault files directly from the checkout. It serves no static files and runs only with loopback Firebase Auth and Firestore emulators. The source files remain authoritative. The harness is outside the application Hosting and Functions entries.

```sh
npm --prefix functions ci
node scripts/development/vault-boundary/inventory.cjs > vault-field-matrix.tsv
node --test tests/functions/{f8-strength-honor-access-policy,athlete-lane-context,f8-curriculum-compatibility,f8-progression-policy}.test.mjs
cd scripts/development/vault-boundary
firebase emulators:exec --project demo-sandman-vault --only auth,firestore 'node --test boundary.test.cjs'
```

In an environment that configures a proxy for localhost, clear the HTTP and HTTPS proxy variables for the emulator command after installing emulator binaries.

## Audience review

| Class | Treatment |
|---|---|
| Public reference | No field received public approval in this proof. |
| Athlete-deliverable candidates | Session IDs, numbers, titles, objectives, prompts, questions, and existing session instructions. The matrix identifies candidates for review. Athlete delivery also requires source approval, track assignment, eligibility and release checks. |
| Full Coach view | Full records are returned only after Firebase verifies the ID token and the existing active Coach/system Admin staff check succeeds. |
| Internal release or catalog metadata | Release modes, status, counts, range and update fields are withheld from all unsigned and non-Coach requests in the proof. |
| Ambiguous | `coachNote` appears in Vault Strength lessons and Iron references. Existing Strength lane, preseason, and in-season athlete readers display this field. Other unclassified fields remain restricted in the proof. |

The inventory includes all 37 sources and 599 sessions from the Sprint 1 snapshot. It lists each nested field path and its provisional classification. Two source files are empty. No curriculum data is written or duplicated.

## Verification and migration gate

- In the isolated harness, direct Vault URLs return 404. Unsigned and invalid-token requests return 401. Athlete, Management and inactive Coach requests return 403. An active Coach receives all 37 sources with field-value equality and a private, no-store response. Revoking the staff status blocks the same token on its next request.
- Existing release, eligibility and progression regression selection passed 61 tests. Coach review now uses the shared equivalent login URL helper. The Functions lockfile install resolved the earlier missing import.
- **Athlete compatibility: FAIL for activation.** The harness keeps athlete delivery closed. Existing athlete-facing Strength readers render `coachNote`, so bulk redaction would remove content they currently display. The repository's existing Hosting input also exposes the original Vault files as static content. Closing those URLs and switching all approved athletes to authorized projections requires an isolated full-route migration with field-level approval. The harness makes no changes to active delivery, releases, XP or existing athlete routes.
- Studio navigation and mobile integration are held behind that compatibility gate. The existing Sprint 1 review preview remains the visual baseline.
