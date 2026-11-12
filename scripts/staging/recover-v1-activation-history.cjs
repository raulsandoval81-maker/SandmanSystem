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
    const [proposal, intakes, athletes, events] = await Promise.all([
      tx.get(proposalRef),
      tx.get(db.collection('intakes').where('proposalId', '==', PROPOSAL)),
      tx.get(db.collection('athletes').where('uid', '==', ATHLETE)),
      tx.get(history.where('event', '==', 'ATHLETE_ACTIVATED')),
    ]);
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
  });
}

module.exports = { recover };

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
    const { initializeApp } = require('firebase-admin/app');
    const { getFirestore, FieldValue } = require('firebase-admin/firestore');
    const { isOperationalPaidProposal } = require('../../functions/lib/enrollment/operationalPaidProposal.js');
    const db = getFirestore(initializeApp({ projectId: PROJECT }));
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
