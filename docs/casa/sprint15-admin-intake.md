# Sprint 15 — Casa → existing Sandman System Admin

## Scope
Central Admin Reception is reused. No second Admin system or separate inquiry datastore is introduced. This branch is **not a deployment approval**.

## Intake contract
- Existing collection: `general_messages`.
- New source discriminator: `casa-national-site` (client-supplied provenance, **not** an authorization or trusted identity signal).
- Allowed Casa topics: `casa-academy`, `casa-combat`, `casa-fitness`, `casa-partnership`, `casa-expansion`, `casa-general`.
- Every new Casa inquiry enters `ADMIN_REVIEW`, unassigned. No automatic enrollment or coach/manager assignment.
- Keep `organization: sandman-system`, `pipeline: general-messaging`, `routingPolicy: ADMIN_TO_ORGANIZATION_LOCATION_MANAGER`, `requiredManagerLevel: LOCATION_MANAGER`, `preferredOrganization: not-sure`, `preferredLocation: not-sure`; these are existing accepted security-rule values.
- Required: contact name, email, message, topic, true consent, language, timestamps, null assignment fields and the remaining **exact** existing general-message schema. This branch does not yet implement an externally hosted Casa submission adapter.
- Admin Reception now lets staff filter by source and Casa topic. Classifying a record does not grant branch access. Admin currently lacks real Combat and Fitness organization routing destinations—do not choose `other-organization` as a fake final assignment.

## Release gates
1. Run `node --test tests/casa/casa-central-admin-contract.test.cjs`.
2. Test Firestore security rules with Firebase emulator: accepted authorized-shaped national request; rejected malformed/extra fields, false consent, unapproved Casa topics, direct assignment and unauthorized reads.
3. Validate current public message submission in staging (was previously inconsistent with rules).
4. Build a protected Casa website submission adapter with the same schema and consent. Secure authorized domain / Firebase config, anti-spam and abuse protections; **do not write test inquiries into production**.
5. Verify a test Casa Academy/Combat/Fitness/partnership inquiry appears under Admin Reception with the correct source and classification; confirm it is not visible to unauthorized roles and never creates an athlete/enrollment automatically.
6. Establish Admin workflow for national inquiries that do not have a physical location or management assignment. Do not force them into local Management.
7. Only after reviews and owner approval should production hosting or Firestore rules be considered.

## Out of scope
No live domains/DNS, no production data writes, no cloud function deployments, no automatic routing to Academy/Combat/Fitness, no new Admin application.
