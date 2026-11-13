'use strict';

const PROPOSAL = 'P-000009';
const ATHLETE = 'F8_0002';
const INTAKE = '5e6c8aa4daf2c4132eaf9e7490c0732a';
const PROJECT = 'sandman-combat-staging';
const HISTORY = `athlete_activated_${INTAKE}_${ATHLETE.toLowerCase()}`;

async function recover(db, serverTimestamp, isOperationalPaidProposal, apply) {
  const proposalRef = db.doc(`proposals/${PROPOSAL}`);
  const history = proposalRef.collection('history');
  const target = history.doc(HISTORY);
  return db.runTransaction(async tx => {
    const read = async (operation, ref) => {
      try {
        return await tx.get(ref);
      } catch (error) {
        const code = Number.isInteger(error.code) ? error.code : 'unknown';
        throw new Error(`Firestore ${operation} failed (status ${code}).`, { cause: error });
      }
    };
    const proposal = await read('BatchGet proposal (opens transaction)', proposalRef);
    const intakes = await read('RunQuery approved Intake', db.collection('intakes').where('proposalId', '==', PROPOSAL));
    const athletes = await read('RunQuery athlete UID', db.collection('athletes').where('uid', '==', ATHLETE));
    const events = await read('RunQuery activation history', history.where('event', '==', 'ATHLETE_ACTIVATED'));
    const payment = proposal.data();
    const intake = intakes.docs.find(doc => doc.id === INTAKE)?.data();
    const approved = intakes.docs.filter(doc => doc.data().status === 'approved' && doc.data().minted === true);
    const athlete = athletes.docs[0]?.data();
    if (!proposal.exists || !isOperationalPaidProposal(payment) ||
        payment.paymentMethod !== 'cash_prepaid' || payment.cashPrepayment?.amountCents !== 96000 ||
        payment.cashPrepayment?.membershipPaidInFull !== true ||
        approved.length !== 1 || approved[0].id !== INTAKE ||
        intake?.mode !== 'new_athlete' || intake.approvedUid !== ATHLETE ||
        athletes.size !== 1 || athletes.docs[0].id !== ATHLETE ||
        athlete?.createdAt?.toMillis() !== intake.approvedAt?.toMillis() ||
        !intake.approvedAt?.toMillis() || !intake.locationId ||
        athlete.locationId !== intake.locationId || payment.locationId !== intake.locationId) {
      throw new Error('Persisted staging activation and paid proposal do not match the recovery fixture.');
    }
    if (events.size) {
      const event = events.docs[0].data();
      if (events.size !== 1 || events.docs[0].id !== HISTORY || event.intakeId !== INTAKE ||
          event.proposalId !== PROPOSAL || event.athleteUid !== ATHLETE ||
          event.occurredAt?.toMillis() !== intake.approvedAt.toMillis()) {
        throw new Error('Conflicting activation history exists.');
      }
      return 'already verified';
    }
    if (!apply) return 'verified, history missing';
    tx.create(target, {
      event: 'ATHLETE_ACTIVATED',
      proposalId: PROPOSAL,
      athleteUid: ATHLETE,
      intakeId: INTAKE,
      locationId: intake.locationId,
      fromStatus: 'PAID',
      toStatus: 'PAID',
      createdBy: 'staging-v1-recovery',
      createdByName: 'Staging Enrollment Recovery',
      source: 'persisted_intake_approval_recovery',
      occurredAt: intake.approvedAt,
      createdAt: serverTimestamp(),
    });
    return 'created one activation history event';
  }, apply ? undefined : { readOnly: true });
}

function stagingFirestoreOptions(env, readFile) {
  const keyFilename = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFilename || env.GOOGLE_GHA_CREDS_PATH !== keyFilename ||
      env.CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE !== keyFilename ||
      env.GOOGLE_CLOUD_PROJECT !== PROJECT) {
    throw new Error('Expected the protected staging WIF credential file and project.');
  }
  const credential = JSON.parse(readFile(keyFilename, 'utf8'));
  const audience = '//iam.googleapis.com/projects/991554514268/locations/global/' +
    'workloadIdentityPools/sandman-github-staging/providers/sandman-hybrid-staging';
  const impersonationUrl = 'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
    `sandman-practice-deployer@${PROJECT}.iam.gserviceaccount.com:generateAccessToken`;
  if (credential.type !== 'external_account' || credential.audience !== audience ||
      credential.subject_token_type !== 'urn:ietf:params:oauth:token-type:jwt' ||
      credential.token_url !== 'https://sts.googleapis.com/v1/token' ||
      credential.service_account_impersonation_url !== impersonationUrl) {
    throw new Error('WIF credential does not match the protected staging provider and deployer.');
  }
  return { projectId: PROJECT, keyFilename };
}

module.exports = { recover, stagingFirestoreOptions };

if (require.main === module) {
  (async () => {
    if (process.env.CONFIRM_PROJECT !== PROJECT || process.env.GITHUB_REF !== 'refs/heads/main' ||
        process.env.GITHUB_REPOSITORY !== 'raulsandoval81-maker/SandmanSystem' ||
        process.env.GITHUB_WORKFLOW_REF !==
          'raulsandoval81-maker/SandmanSystem/.github/workflows/staging-exact-sha-release.yml@refs/heads/main' ||
        process.env.APPROVAL !== 'APPROVE_V1_STAGING_ACTIVATION_AND_MEMBERS' ||
        process.env.FIRESTORE_EMULATOR_HOST ||
        !['--check', '--apply'].includes(process.argv[2]) || process.argv.length !== 3) {
      throw new Error('Protected staging recovery guard failed.');
    }
    // Firebase Admin's credential-file parser rejects external_account JSON.
    // The Firestore client delegates WIF exchange and refresh to Google Auth.
    const { readFileSync } = require('node:fs');
    const options = stagingFirestoreOptions(process.env, readFileSync);
    const { Firestore, FieldValue } = require('@google-cloud/firestore');
    const { isOperationalPaidProposal } = require('../../functions/lib/enrollment/operationalPaidProposal.js');
    const { execFileSync } = require('node:child_process');
    const active = execFileSync('gcloud', ['auth', 'list', '--filter=status:ACTIVE',
      '--format=value(account)'], { encoding: 'utf8' }).trim();
    if (active !== `sandman-practice-deployer@${PROJECT}.iam.gserviceaccount.com`) {
      throw new Error('Active gcloud identity does not match the protected staging deployer.');
    }
    console.log(`Verified staging deployer: ${active}`);
    const db = new Firestore(options);
    try {
      console.log(await recover(db, FieldValue.serverTimestamp, isOperationalPaidProposal, process.argv[2] === '--apply'));
    } finally {
      await db.terminate();
    }
  })().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
